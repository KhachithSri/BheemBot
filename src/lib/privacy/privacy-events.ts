import { supabaseAdmin } from "@/lib/supabase/admin";
import { minimizePii } from "./minimize";

export async function recordPrivacyEvents(
  entries: Array<{
    sessionId?: string | null;
    messageId?: string | null;
    content: string;
    source?: "resume_parse";
    includeMaskedContent?: boolean;
  }>,
): Promise<void> {
  const events = entries.flatMap((entry) => {
    const result = minimizePii(entry.content, {
      resume: entry.source === "resume_parse",
    });
    if (result.redactions === 0) return [];

    return [{
      ...(entry.sessionId ? { session_id: entry.sessionId } : {}),
      ...(entry.messageId ? { message_id: entry.messageId } : {}),
      pii_types: result.types,
      pii_count: result.redactions,
      ...(entry.includeMaskedContent === false
        ? {}
        : { masked_content: result.text }),
      confidence_threshold: 0.7,
      ...(entry.source ? { metadata: { source: entry.source } } : {}),
    }];
  });

  if (events.length === 0) return;

  const { error } = await supabaseAdmin.from("privacy_events").insert(events);
  if (error) {
    throw new Error(`Could not record privacy events: ${error.message}`);
  }
}
