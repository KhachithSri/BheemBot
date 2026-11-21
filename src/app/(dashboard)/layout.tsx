import { DashboardShell } from "@/components/layout/sidebar";
import { DashboardWelcomeGate } from "@/components/layout/dashboard-welcome-gate";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardWelcomeGate>
      <DashboardShell>{children}</DashboardShell>
    </DashboardWelcomeGate>
  );
}
