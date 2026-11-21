import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("privacy/session-retention");
export const SESSION_CONTENT_RETENTION_DAYS = 30;
const STORAGE_BUCKETS = ["recordings", "screenshots"] as const;
const STORAGE_PAGE_SIZE = 100;
const STORAGE_DELETE_BATCH_SIZE = 100;
const SESSION_BATCH_SIZE = 100;

async function removeSessionObjects(
  bucket: (typeof STORAGE_BUCKETS)[number],
  sessionId: string,
): Promise<void> {
  const storage = supabaseAdmin.storage.from(bucket);
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.list(sessionId, {
      limit: STORAGE_PAGE_SIZE,
      offset,
    });
    if (error) {
      throw new Error(
        `Could not list ${bucket} objects for session ${sessionId}: ${error.message}`,
      );
    }

    const files = data ?? [];
    paths.push(
      ...files
        .filter((file) => file.name && file.id)
        .map((file) => `${sessionId}/${file.name}`),
    );
    if (files.length < STORAGE_PAGE_SIZE) break;
    offset += files.length;
  }

  for (let index = 0; index < paths.length; index += STORAGE_DELETE_BATCH_SIZE) {
    const { error } = await storage.remove(
      paths.slice(index, index + STORAGE_DELETE_BATCH_SIZE),
    );
    if (error) {
      throw new Error(
        `Could not remove ${bucket} objects for session ${sessionId}: ${error.message}`,
      );
    }
  }
}

export async function removeSessionMedia(sessionIds: string[]): Promise<void> {
  for (const sessionId of Array.from(new Set(sessionIds))) {
    for (const bucket of STORAGE_BUCKETS) {
      await removeSessionObjects(bucket, sessionId);
    }
  }
}

export async function purgeExpiredSessionContent(
  now = new Date(),
): Promise<{ purged: number; cutoff: string }> {
  const cutoffDate = new Date(
    now.getTime() - SESSION_CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const cutoff = cutoffDate.toISOString();

  let purged = 0;
  while (true) {
    const { data: sessions, error: loadError } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .is("contentPurgedAt", null)
      .in("status", ["COMPLETED", "ABANDONED"])
      .or(
        `completedAt.lte.${cutoff},and(completedAt.is.null,lastActivityAt.lte.${cutoff})`,
      )
      .order("lastActivityAt", { ascending: true })
      .limit(SESSION_BATCH_SIZE);

    if (loadError) {
      throw new Error(`Could not load expired sessions: ${loadError.message}`);
    }

    if (!sessions?.length) break;

    for (const session of sessions) {
      const sessionId = session.id as string;
      try {
        await removeSessionMedia([sessionId]);

        const { error: messageError } = await supabaseAdmin
          .from("messages")
          .delete()
          .eq("sessionId", sessionId);
        if (messageError) {
          throw new Error(`Could not delete messages: ${messageError.message}`);
        }

        const { error: eventError } = await supabaseAdmin
          .from("privacy_events")
          .delete()
          .eq("session_id", sessionId);
        if (eventError) {
          throw new Error(`Could not delete privacy events: ${eventError.message}`);
        }

        const { error: updateError } = await supabaseAdmin
          .from("sessions")
          .update({
            contentPurgedAt: now.toISOString(),
            participantName: null,
            participantEmail: null,
            participantPhone: null,
            participantMetadata: null,
            summary: null,
            insights: null,
            themes: [],
            sentiment: null,
            screenshots: null,
            antiCheatingLog: [],
          })
          .eq("id", sessionId)
          .is("contentPurgedAt", null);

        if (updateError) {
          throw new Error(
            `Could not mark session content purged: ${updateError.message}`,
          );
        }

        purged += 1;
      } catch (error) {
        log.error(`Content purge failed for session ${sessionId}:`, error);
        throw error;
      }
    }
  }

  return { purged, cutoff };
}
