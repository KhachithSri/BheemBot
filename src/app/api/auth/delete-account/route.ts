import { supabaseAdmin } from "@/lib/supabase/admin";
import { removeSessionMedia } from "@/lib/privacy/session-retention";
import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { NextResponse } from "next/server";

const log = createLogger("api/auth/delete-account");

export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = user.id;

    const { data: ownedInterviews, error: interviewLookupError } =
      await supabaseAdmin.from("interviews").select("id").eq("userId", userId);
    if (interviewLookupError) throw interviewLookupError;

    const { data: ownedOrganizations, error: organizationLookupError } =
      await supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("ownerId", userId);
    if (organizationLookupError) throw organizationLookupError;

    const ownedProjectIds: string[] = [];
    if (ownedOrganizations?.length) {
      const { data: projects, error: projectLookupError } = await supabaseAdmin
        .from("projects")
        .select("id")
        .in(
          "organizationId",
          ownedOrganizations.map((organization) => organization.id),
        );
      if (projectLookupError) throw projectLookupError;
      ownedProjectIds.push(...(projects ?? []).map((project) => project.id));
    }

    const interviewIds = new Set(
      (ownedInterviews ?? []).map((interview) => interview.id),
    );
    if (ownedProjectIds.length) {
      const { data: projectInterviews, error: projectInterviewError } =
        await supabaseAdmin
          .from("interviews")
          .select("id")
          .in("projectId", ownedProjectIds);
      if (projectInterviewError) throw projectInterviewError;
      for (const interview of projectInterviews ?? []) {
        interviewIds.add(interview.id);
      }
    }

    if (interviewIds.size) {
      const { data: sessions, error: sessionLookupError } = await supabaseAdmin
        .from("sessions")
        .select("id")
        .in("interviewId", Array.from(interviewIds));
      if (sessionLookupError) throw sessionLookupError;
      await removeSessionMedia((sessions ?? []).map((session) => session.id));
    }

    const cleanupResults = await Promise.all([
      supabaseAdmin.from("interviews").delete().eq("userId", userId),
      // Removing an organization cascades to its projects and memberships.
      supabaseAdmin.from("organizations").delete().eq("ownerId", userId),
      supabaseAdmin.from("audit_logs").delete().eq("userId", userId),
      supabaseAdmin.from("webhooks").delete().eq("userId", userId),
    ]);

    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) {
      return NextResponse.json(
        { error: `Could not remove account data: ${cleanupError.message}` },
        { status: 500 },
      );
    }

    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Account deletion failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
