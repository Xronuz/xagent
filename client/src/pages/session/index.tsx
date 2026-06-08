import ChatInterface from "@/components/chat"
import { getSessionBySlug, getSessionProcesses } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom"
import { useState, useEffect } from "react";
import { PreviewPanel, type Process } from "@/components/preview-panel";

const SessionPage = () => {
  const { slugid } = useParams()
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

  const { data, isPending } = useQuery({
    queryKey: ["session", slugid],
    queryFn: () => getSessionBySlug(slugid ?? ""),
    enabled: Boolean(slugid),
    retry: false,
    throwOnError: false,
  });

  const { data: processesData } = useQuery({
    queryKey: ["session-processes", slugid],
    queryFn: () => getSessionProcesses(slugid ?? ""),
    enabled: Boolean(slugid && data?.session),
    refetchInterval: 3000,
  });

  // Find a process to preview: preferably one with a URL, or the most recent one
  const activeProcess = (processesData?.processes?.find((p: Record<string, unknown>) => p.detectedUrl) 
    || processesData?.processes?.[processesData?.processes.length - 1]) as Process | undefined;

  // Auto-open preview when a URL is newly detected
  useEffect(() => {
    if (activeProcess?.detectedUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimeout(() => setIsPreviewOpen(true), 0);
    }
  }, [activeProcess?.detectedUrl]);

  if (isPending) {
    return (
      <div className="flex h-full min-h-0 w-full items-start justify-center px-6 py-8">
        <div className="w-full max-w-4xl space-y-3">
          <div className="h-5 w-56 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  const showPreview = Boolean(activeProcess && isPreviewOpen);

  if (data?.session) {
    return (
      <div className="flex w-full h-full overflow-hidden">
        <div className={`transition-all duration-300 ${showPreview ? "w-1/2 border-r" : "w-full"}`}>
          <ChatInterface
            key={data.session.slugId}
            isSingleSession={true}
            initialMessages={data.messages}
            sessionTitle={data.session.title ?? "Untitled Session"}
            slugId={data.session.slugId}
            repoUrl={data.session.repoUrl ?? ""}
            defaultBranch={data.session.defaultBranch ?? "main"}
            branchName={data.session.branchName ?? null}
          />
        </div>
        {showPreview && (
          <div className="w-1/2 h-full">
            <PreviewPanel process={activeProcess!} onClose={() => setIsPreviewOpen(false)} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full h-full overflow-hidden">
      <div className={`transition-all duration-300 ${showPreview ? "w-1/2 border-r" : "w-full"}`}>
        <ChatInterface
          key={slugid}
          isSingleSession={false}
          slugId={slugid}
        />
      </div>
      {showPreview && (
        <div className="w-1/2 h-full">
          <PreviewPanel process={activeProcess!} onClose={() => setIsPreviewOpen(false)} />
        </div>
      )}
    </div>
  )
}

export default SessionPage
