"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CandidateResumeUpload } from "@/components/interview/candidate-resume-upload";
import { Link2Off, CheckCircle2 } from "lucide-react";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { useToast } from "@/hooks/use-toast";
import type { CandidateQuestionPersonalization } from "@/lib/ai/types";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const { toast } = useToast();

  const [completed, setCompleted] = useState(false);
  const [personalizedQuestions, setPersonalizedQuestions] =
    useState<CandidateQuestionPersonalization[] | null>(null);
  const [resumeProcessing, setResumeProcessing] = useState(false);

  const candidate = trpc.candidate.getByToken.useQuery(
    { token },
    { retry: false },
  );

  const createSession = trpc.session.createFromInvite.useMutation({
    onSuccess: () => {
      goToSession();
    },
    onError: (error) => {
      toast({
        title: "Failed to start interview",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sessionPath = `/i/invite/${token}/session`;

  useEffect(() => {
    router.prefetch(sessionPath);
  }, [router, sessionPath]);

  const goToSession = useCallback(() => {
    router.push(sessionPath);
  }, [router, sessionPath]);

  useEffect(() => {
    if (!candidate.data || completed) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (candidate.data as any).session;
    if (session) {
      if (session.status === "COMPLETED") {
        setCompleted(true);
      } else {
        goToSession();
      }
      return;
    }

  }, [candidate.data, completed, goToSession]);

  // Loading
  if (candidate.isLoading) {
    return <PreparingScreen />;
  }

  // Error / invalid token
  if (candidate.isError || !candidate.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2Off className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Invalid Invite Link</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite link is invalid or the interview is no longer available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed
  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
            <h2 className="mt-4 text-2xl font-bold">Thank you!</h2>
            <p className="mt-2 text-muted-foreground">
              Your interview has been completed successfully. We appreciate your
              time and thoughtful responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const interview = candidate.data.interview as {
    title: string;
    description: string | null;
    publicSlug: string;
    questions: { id: string }[];
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-2xl">{interview.title}</CardTitle>
          <CardDescription>
            {interview.description || "You have been invited to complete this interview."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            {interview.questions.length} questions
          </p>
          <CandidateResumeUpload
            interviewSlug={interview.publicSlug}
            inviteToken={token}
            onQuestionsReady={setPersonalizedQuestions}
            onProcessingChange={setResumeProcessing}
          />
          <Button
            className="w-full"
            disabled={resumeProcessing || createSession.isLoading}
            onClick={() => {
              createSession.mutate({
                inviteToken: token,
                personalizedQuestions: personalizedQuestions ?? undefined,
              });
            }}
          >
            Start Interview
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
