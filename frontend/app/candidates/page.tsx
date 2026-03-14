"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { CandidateListResponse, CandidateListItem } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Briefcase, Mail, GitMerge, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const AVATAR_COLORS = [
  "bg-terra text-white",
  "bg-sage text-white",
  "bg-[#C4903A] text-white",
  "bg-[#6B8CA3] text-white",
  "bg-[#8B6B99] text-white",
  "bg-muted-foreground text-white",
  "bg-[#A0785A] text-white",
  "bg-[#7A6B5D] text-white",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function CandidatesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<CandidateListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "merged">("active");
  const [mergedCount, setMergedCount] = useState(0);
  const [cleaning, setCleaning] = useState(false);

  const fetchCandidates = useCallback(
    (status: "active" | "merged") => {
      setLoading(true);
      api<CandidateListResponse>(`/api/candidates?limit=50&status=${status}`)
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [],
  );

  const refreshAll = useCallback(() => {
    fetchCandidates(tab);
    api<CandidateListResponse>("/api/candidates?limit=1&status=merged")
      .then((r) => setMergedCount(r.total))
      .catch(() => {});
  }, [tab, fetchCandidates]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    refreshAll();
  }, [user, authLoading, router, tab, refreshAll]);

  const handleDelete = async (id: string, name: string) => {
    try {
      await api(`/api/candidates/${id}`, { method: "DELETE" });
      toast.success(`Deleted ${name}`);
      // Remove from local state immediately
      setData((prev) =>
        prev
          ? {
              ...prev,
              total: prev.total - 1,
              results: prev.results.filter((c) => c.id !== id),
            }
          : prev
      );
    } catch {
      toast.error("Failed to delete candidate");
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const res = await api<{ deleted: number }>("/api/candidates/cleanup/unknowns", {
        method: "DELETE",
      });
      if (res.deleted > 0) {
        toast.success(`Cleaned up ${res.deleted} unknown candidate${res.deleted > 1 ? "s" : ""}`);
        refreshAll();
      } else {
        toast.info("No unknown candidates to clean up");
      }
    } catch {
      toast.error("Cleanup failed");
    } finally {
      setCleaning(false);
    }
  };

  // Check if there are any unknowns worth cleaning
  const hasUnknowns = data?.results?.some(
    (c) => c.full_name.toLowerCase() === "unknown" && c.ingestion_status === "needs_review"
  );

  if (authLoading) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh">
          <div className="mb-6 flex items-end justify-between animate-rise">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                Candidates
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data ? `${data.total} ${tab === "merged" ? "merged" : ""} candidates in your pipeline` : "Loading..."}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Cleanup button */}
              {hasUnknowns && tab === "active" && (
                <button
                  onClick={handleCleanup}
                  disabled={cleaning}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-all hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  <Sparkles className="size-3" />
                  {cleaning ? "Cleaning..." : "Clean Up Unknowns"}
                </button>
              )}

              {/* Tab filter */}
              <div className="flex items-center gap-1 rounded-lg border border-white/40 bg-white/30 p-1 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
                <button
                  onClick={() => setTab("active")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    tab === "active"
                      ? "bg-white/80 text-foreground shadow-sm dark:bg-white/10"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setTab("merged")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    tab === "merged"
                      ? "bg-white/80 text-foreground shadow-sm dark:bg-white/10"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GitMerge className="size-3" />
                  Merged
                  {mergedCount > 0 && (
                    <span className="ml-0.5 rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                      {mergedCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Card grid */}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="surface rounded-2xl p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="mt-1.5 h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : data?.results?.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger">
              {data.results.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onClick={() => router.push(`/candidates/${c.id}`)}
                  onDelete={() => handleDelete(c.id, c.full_name)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-secondary">
                <Briefcase className="size-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No candidates yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Upload a resume to get started</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate: c,
  onClick,
  onDelete,
}: {
  candidate: CandidateListItem;
  onClick: () => void;
  onDelete: () => void;
}) {
  const color = getAvatarColor(c.full_name);
  const initials = getInitials(c.full_name);

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer surface surface-hover rounded-2xl p-5"
    >
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-lg bg-transparent text-muted-foreground opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-500/10"
        title="Delete candidate"
      >
        <Trash2 className="size-3.5" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${color}`}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-display)] text-[15px] font-semibold">
            {c.full_name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {c.current_title || "No title"}
          </p>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {c.location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3 text-muted-foreground" />
            {c.location}
          </span>
        )}
        {c.years_experience != null && (
          <span className="flex items-center gap-1">
            <Briefcase className="size-3 text-muted-foreground" />
            {c.years_experience} yrs
          </span>
        )}
        {c.email && (
          <span className="flex items-center gap-1">
            <Mail className="size-3 text-muted-foreground" />
            {c.email.split("@")[0]}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
        <Badge variant="secondary" className="rounded-full text-[10px] font-medium capitalize">
          {c.source.replace(/_/g, " ")}
        </Badge>
        <StatusPill status={c.ingestion_status} />
      </div>
    </div>
  );
}
