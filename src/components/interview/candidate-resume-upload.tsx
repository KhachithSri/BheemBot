"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CandidateQuestionPersonalization } from "@/lib/ai/types";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

interface CandidateResumeUploadProps {
  interviewSlug: string;
  inviteToken?: string;
  onQuestionsReady: (questions: CandidateQuestionPersonalization[] | null) => void;
  onProcessingChange: (processing: boolean) => void;
}

export function CandidateResumeUpload({
  interviewSlug,
  inviteToken,
  onQuestionsReady,
  onProcessingChange,
}: CandidateResumeUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setFileName("");
    onQuestionsReady(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Upload a PDF resume.");
      return;
    }

    setLoading(true);
    onProcessingChange(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("interviewSlug", interviewSlug);
      if (inviteToken) formData.append("inviteToken", inviteToken);

      const response = await fetch("/api/interviews/tailor-questions", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not personalize interview questions.");
      }
      if (!Array.isArray(data.questions)) {
        throw new Error("Could not personalize interview questions.");
      }
      setFileName(file.name);
      onQuestionsReady(data.questions as CandidateQuestionPersonalization[]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not process the resume. Please try again.",
      );
    } finally {
      setLoading(false);
      onProcessingChange(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Personalize questions with your resume</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional PDF upload. The resume is used to tailor questions for this interview and is not saved.
        </p>
      </div>
      <Input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {loading ? "Updating questions..." : fileName ? "Replace resume" : "Upload PDF"}
        </Button>
        {fileName && !loading && (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {fileName} — questions updated
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFileName("");
                setError("");
                onQuestionsReady(null);
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Remove
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
