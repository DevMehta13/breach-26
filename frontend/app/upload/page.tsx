"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/providers/auth-provider";
import { api, apiUpload } from "@/lib/api";
import type { SyncResponse, BatchUploadResponse } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWebSocket } from "@/providers/websocket-provider";
import {
  Upload as UploadIcon,
  FileText,
  Building2,
  Mail,
  Linkedin,
  Loader2,
  CheckCircle2,
  XCircle,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

type FileStatus = "pending" | "uploading" | "success" | "error";

interface FileProgress {
  name: string;
  status: FileStatus;
  error?: string;
}

export default function UploadPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { isConnected, candidateCount } = useWebSocket();
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkedinUploading, setLinkedinUploading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  if (!authLoading && !user) {
    router.push("/login");
    return null;
  }

  // ── Standard resume dropzone — per-file progress ──────────────
  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      // Initialize progress for all files
      const initial: FileProgress[] = files.map((f) => ({
        name: f.name,
        status: "pending",
      }));
      setFileProgress(initial);
      setUploading(true);

      // Upload each file individually with progress tracking
      const uploadFile = async (file: File, index: number) => {
        setFileProgress((prev) =>
          prev.map((p, i) => (i === index ? { ...p, status: "uploading" } : p))
        );
        try {
          const fd = new FormData();
          fd.append("file", file);
          await apiUpload("/api/ingest/upload", fd);
          setFileProgress((prev) =>
            prev.map((p, i) => (i === index ? { ...p, status: "success" } : p))
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setFileProgress((prev) =>
            prev.map((p, i) =>
              i === index ? { ...p, status: "error", error: msg } : p
            )
          );
        }
      };

      // Process files concurrently
      await Promise.all(files.map((file, idx) => uploadFile(file, idx)));

      setUploading(false);

      // Summary toast
      const succeeded = files.length - initial.filter((_, i) => {
        // We need the final state — read from the latest
        return false;
      }).length;
      toast.success(`Processed ${files.length} file(s)`);
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: true,
    disabled: uploading,
  });

  // ── LinkedIn PDF dropzone ───────────────────────────────────────
  const onLinkedinDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setLinkedinUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        await apiUpload("/api/ingest/linkedin", fd);
        toast.success(`LinkedIn profile parsed: ${file.name}`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "LinkedIn upload failed");
      } finally {
        setLinkedinUploading(false);
      }
    },
    []
  );

  const {
    getRootProps: getLinkedinRootProps,
    getInputProps: getLinkedinInputProps,
    isDragActive: isLinkedinDragActive,
  } = useDropzone({
    onDrop: onLinkedinDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    disabled: linkedinUploading,
  });

  // ── Sync handlers ───────────────────────────────────────────────
  async function handleSync(source: "hrms" | "gmail") {
    setSyncing(source);
    try {
      const endpoint = source === "hrms" ? "/api/ingest/hrms/sync" : "/api/ingest/gmail/sync";
      const data = await api<SyncResponse>(endpoint, { method: "POST" });
      toast.success(`Synced ${data.total} candidate(s) from ${data.source}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  async function handleConnectGoogle() {
    try {
      const data = await api<{ url: string }>("/api/auth/google/url");
      window.location.href = data.url;
    } catch {
      toast.error("Failed to start Google connection");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Upload &amp; Sync</h1>
            <div className="flex items-center gap-4">
              {/* Real-time candidate counter */}
              {candidateCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                  <Users className="size-4" />
                  <span>{candidateCount} ingested this session</span>
                </div>
              )}
              {/* WebSocket connection indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {isConnected ? (
                  <>
                    <Wifi className="size-3.5 text-green-500" />
                    <span>Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3.5 text-red-400" />
                    <span>Offline</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Standard Resume Dropzone */}
            <Card>
              <CardHeader>
                <CardTitle>Resume Upload</CardTitle>
                <CardDescription>
                  Drag and drop PDF or DOCX files (max 10 MB each)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  {...getRootProps()}
                  className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 backdrop-blur-sm transition-all cursor-pointer ${
                    isDragActive
                      ? "border-terra/40 bg-terra/5"
                      : "border-white/50 bg-white/20 hover:border-terra/30 hover:bg-white/40"
                  } ${uploading ? "pointer-events-none opacity-60" : ""}`}
                >
                  <input {...getInputProps()} />
                  {uploading ? (
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  ) : (
                    <UploadIcon className="size-8 text-muted-foreground" />
                  )}
                  <p className="text-sm text-muted-foreground text-center">
                    {isDragActive
                      ? "Drop files here..."
                      : uploading
                        ? "Processing..."
                        : "Drag files here or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, DOCX up to 10 MB — multiple files supported
                  </p>
                </div>

                {/* Per-file progress list */}
                {fileProgress.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {fileProgress.map((fp, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <FileStatusIcon status={fp.status} />
                        <span className="flex-1 truncate">{fp.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {fp.status === "pending" && "Waiting..."}
                          {fp.status === "uploading" && "Processing..."}
                          {fp.status === "success" && "Done"}
                          {fp.status === "error" && (
                            <span className="text-destructive" title={fp.error}>
                              {fp.error || "Failed"}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* LinkedIn PDF Dropzone */}
            <Card className="border-[#0A66C2]/20 bg-[#0A66C2]/[0.02]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Linkedin className="size-5 text-[#0A66C2]" />
                  <div>
                    <CardTitle>LinkedIn Profile Upload</CardTitle>
                    <CardDescription>
                      Optimized for LinkedIn&apos;s &ldquo;Save to PDF&rdquo; format
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  {...getLinkedinRootProps()}
                  className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 backdrop-blur-sm transition-all cursor-pointer ${
                    isLinkedinDragActive
                      ? "border-[#0A66C2] bg-[#0A66C2]/5"
                      : "border-[#0A66C2]/20 bg-white/20 hover:border-[#0A66C2]/40 hover:bg-white/40"
                  } ${linkedinUploading ? "pointer-events-none opacity-60" : ""}`}
                >
                  <input {...getLinkedinInputProps()} />
                  {linkedinUploading ? (
                    <Loader2 className="size-8 animate-spin text-[#0A66C2]" />
                  ) : (
                    <Linkedin className="size-8 text-[#0A66C2]/60" />
                  )}
                  <p className="text-sm text-muted-foreground text-center">
                    {isLinkedinDragActive
                      ? "Drop LinkedIn PDF here..."
                      : linkedinUploading
                        ? "Parsing LinkedIn profile..."
                        : "Drop LinkedIn PDF here or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    Go to a LinkedIn profile &rarr; More &rarr; Save to PDF
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Sync */}
          <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Sync
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SyncCard
              title="BambooHR"
              description="Pull candidates from HRMS"
              icon={<Building2 className="size-5" />}
              loading={syncing === "hrms"}
              disabled={syncing !== null}
              onClick={() => handleSync("hrms")}
            />
            {user?.google_connected ? (
              <SyncCard
                title="Gmail"
                description="Fetch resume attachments"
                icon={<Mail className="size-5" />}
                loading={syncing === "gmail"}
                disabled={syncing !== null}
                onClick={() => handleSync("gmail")}
              />
            ) : (
              <Card className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="text-muted-foreground">
                      <Mail className="size-5" />
                    </div>
                    <div>
                      <CardTitle>Gmail</CardTitle>
                      <CardDescription>Connect Google to sync resume attachments</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleConnectGoogle}
                  >
                    Connect Gmail
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function FileStatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case "pending":
      return <FileText className="size-4 text-muted-foreground" />;
    case "uploading":
      return <Loader2 className="size-4 animate-spin text-primary" />;
    case "success":
      return <CheckCircle2 className="size-4 text-green-600" />;
    case "error":
      return <XCircle className="size-4 text-destructive" />;
  }
}

function SyncCard({
  title,
  description,
  icon,
  loading,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground">{icon}</div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <Button
          variant="outline"
          className="w-full"
          onClick={onClick}
          disabled={disabled || loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Syncing...
            </>
          ) : (
            `Sync ${title}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
