import { createLogger } from "@/lib/logger";
import { purgeExpiredSessionContent } from "@/lib/privacy/session-retention";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const log = createLogger("api/maintenance/purge-expired");

export async function POST(req: Request) {
  const expectedSecret = process.env.RETENTION_JOB_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Retention job is not configured" },
      { status: 503 },
    );
  }

  const authorization = req.headers.get("authorization") ?? "";
  const providedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(expectedSecret);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await purgeExpiredSessionContent());
  } catch (error) {
    log.error("Retention purge failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Retention purge failed",
      },
      { status: 500 },
    );
  }
}
