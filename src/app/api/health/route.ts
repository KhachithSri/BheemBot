import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient();
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  // Skip the RPC check - just check tables directly
  const requiredTables = [
    "profiles",
    "organizations",
    "organization_members",
    "projects",
    "project_members",
    "interviews",
    "questions",
    "sessions",
    "candidates",
    "messages",
    "api_keys",
    "audit_logs",
    "webhooks",
    "support_tickets",
  ];

  for (const table of requiredTables) {
    try {
      const { error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .limit(1);
      checks[table] = { ok: !error, error: error?.message };
    } catch (err) {
      checks[table] = { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "issues_found",
      checks,
      message: allOk
        ? "All database tables accessible"
        : "Some database tables are missing or inaccessible. Run migrations in Supabase SQL Editor.",
    },
    { status: allOk ? 200 : 500 }
  );
}
