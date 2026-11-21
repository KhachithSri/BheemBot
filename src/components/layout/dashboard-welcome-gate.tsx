"use client";

import { CandidateWelcomeScreen } from "@/components/interview/candidate-welcome-screen";
import { useWelcomeScreenDelay } from "@/hooks/use-welcome-screen-delay";

export function DashboardWelcomeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const showWelcomeScreen = useWelcomeScreenDelay("dashboard");

  if (showWelcomeScreen) {
    return <CandidateWelcomeScreen />;
  }

  return children;
}
