"use client";

import { ShareModal } from "@/components/interview/share-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Eye, Link2, ListOrdered, Lock, Loader2, Settings, Share2, Users } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { EditInterviewProvider } from "./edit-context";

const tabSkeletons: Record<string, React.ReactNode> = {
  content: (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  ),
  settings: (
    <div className="grid gap-6 md:grid-cols-2">
      <Skeleton className="h-40 md:col-span-2" />
      <Skeleton className="h-[400px]" />
      <Skeleton className="h-[400px]" />
    </div>
  ),
  sessions: (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px]" />
    </div>
  ),
};

const tabs = [
  { value: "content", label: "Content", icon: ListOrdered, href: "" },
  { value: "settings", label: "Settings", icon: Settings, href: "/settings" },
  { value: "sessions", label: "Sessions", icon: Users, href: "/sessions" },
] as const;

export default function EditInterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const id = params.id as string;
  const basePath = `/interviews/${id}/edit`;

  const interview = trpc.interview.getById.useQuery({ id });
  const utils = trpc.useUtils();
  const [shareOpen, setShareOpen] = useState(false);
  const createPreviewMutation = trpc.session.createPreview.useMutation();

  const updateMutation = trpc.interview.update.useMutation({
    onSuccess: () => {
      utils.interview.getById.invalidate({ id });
      toast({ title: "Interview updated" });
    },
  });

  const activeTab = useMemo(() => {
    if (pathname.endsWith("/settings")) return "settings";
    if (pathname.endsWith("/sessions")) return "sessions";
    return "content";
  }, [pathname]);

  const publishMutation = trpc.interview.publish.useMutation();

  const handlePreview = async () => {
    if (!interview.data) return;
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      toast({
        title: "Preview was blocked",
        description: "Allow pop-ups for this site, then try Preview again.",
        variant: "destructive",
      });
      return;
    }
    const interviewState = interview.data as {
      publicSlug?: string | null;
      isActive?: boolean;
    };
    let slug = interviewState.publicSlug;
    if (!slug || !interviewState.isActive) {
      try {
        const result = await publishMutation.mutateAsync({ id });
        slug = result.slug;
        utils.interview.getById.invalidate({ id });
      } catch (error) {
        previewWindow.close();
        toast({
          title: "Failed to generate preview link",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    try {
      const { sessionId } = await createPreviewMutation.mutateAsync({
        interviewId: id,
      });
      previewWindow.location.href = `/i/${slug}?sid=${sessionId}&preview=true`;
    } catch (error) {
      previewWindow.close();
      toast({
        title: "Failed to start preview",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (interview.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!interview.data) {
    return <div>Interview not found</div>;
  }

  const data = interview.data;
  const publicSlug =
    typeof (data as { publicSlug?: string | null }).publicSlug === "string"
      ? (data as { publicSlug: string }).publicSlug
      : null;
  const shareIsPublic = !!(
    publicSlug &&
    (data as { isActive?: boolean }).isActive &&
    !(data as { requireInvite?: boolean }).requireInvite
  );

  return (
    <EditInterviewProvider
      value={{ interview: data, interviewId: id, updateMutation }}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
          <h1 className="text-2xl font-bold">{data.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).publicSlug && (data as any).isActive && !(data as any).requireInvite ? (
              <Badge
                variant="outline"
                className="cursor-pointer gap-1 border-border bg-background text-foreground hover:bg-muted"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/i/${(data as Record<string, unknown>).publicSlug}`,
                  );
                  toast({ title: "Link copied!" });
                }}
              >
                <Link2 className="h-3 w-3" />
                /i/{(data as Record<string, unknown>).publicSlug as string}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Invite only
              </Badge>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).chatEnabled && <Badge variant="outline">Chat</Badge>}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).voiceEnabled && <Badge variant="outline">Voice</Badge>}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).videoEnabled && <Badge variant="outline">Video</Badge>}
          </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={createPreviewMutation.isPending || publishMutation.isPending}
              onClick={() => void handlePreview()}
            >
              {(createPreviewMutation.isPending || publishMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Preview
            </Button>
          </div>
        </div>

        <ShareModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          interviewId={id}
          publicSlug={publicSlug}
          isPublic={shareIsPublic}
        />

        {/* Tab navigation */}
        <div
          className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground no-print"
          role="tablist"
        >
          {tabs.map((tab) => {
            const displayTab = isPending && pendingTab ? pendingTab : activeTab;
            const isActive = displayTab === tab.value;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                disabled={isActive}
                onClick={() => {
                  setPendingTab(tab.value);
                  startTransition(() => {
                    router.push(`${basePath}${tab.href}`);
                  });
                }}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 gap-2",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground/80",
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {isPending && pendingTab ? tabSkeletons[pendingTab] : children}
      </div>
    </EditInterviewProvider>
  );
}
