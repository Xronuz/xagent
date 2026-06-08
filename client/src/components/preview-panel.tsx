import { useRef, useState } from "react";
import { RefreshCcw, ExternalLink, X } from "lucide-react";
import { Button } from "./ui/button";

export interface Process {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
  detectedUrl?: string;
  exitCode?: number;
}

interface PreviewPanelProps {
  process: Process;
  onClose: () => void;
}

export function PreviewPanel({ process, onClose }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    if (process.detectedUrl) {
      window.open(process.detectedUrl, "_blank");
    }
  };

  let statusText = "Server Stopped";
  if (process.status === "running") {
    statusText = process.detectedUrl ? "Server Running" : "Server Starting...";
  } else if (process.status === "error") {
    statusText = "Server Error";
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              process.status === "running" && process.detectedUrl
                ? "bg-green-500"
                : process.status === "running"
                ? "bg-yellow-500"
                : "bg-red-500"
            }`}
          />
          <span className="text-sm font-medium">{statusText}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={!process.detectedUrl}
            title="Refresh"
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenExternal}
            disabled={!process.detectedUrl}
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close Preview">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 bg-muted/20">
        {process.status === "running" && process.detectedUrl ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={process.detectedUrl}
            className="h-full w-full border-0"
            title="Preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {process.status === "running"
              ? "Waiting for URL..."
              : "Preview Unavailable"}
          </div>
        )}
      </div>
    </div>
  );
}
