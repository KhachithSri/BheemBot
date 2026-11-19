import { supabaseAdmin } from "@/lib/supabase/admin";
import { minimizePii } from "./minimize";

export async function recordPrivacyEvents(
  entries: Array<{ sessionId: string; messageId?: string | null; content: string }>,
): Promise<void> {
  const events = entries.flatMap((entry) => {
    const result = minimizePii(entry.content);
    if (result.redactions === 0) return [];

    return [{
      session_id: entry.sessionId,
      ...(entry.messageId ? { message_id: entry.messageId } : {}),
      pii_types: result.types,
      pii_count: result.redactions,
      masked_content: result.text,
      confidence_threshold: 0.7,
    }];
  });

  if (events.length === 0) return;

  const { error } = await supabaseAdmin.from("privacy_events").insert(events);
  if (error) {
    throw new Error(`Could not record privacy events: ${error.message}`);
  }
}
