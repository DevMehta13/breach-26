"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { CandidateListResponse, CandidateListItem } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Briefcase, Mail } from "lucide-react";

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    api<CandidateListResponse>("/api/candidates?limit=50")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

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
                {data ? `${data.total} candidates in your pipeline` : "Loading..."}
              </p>
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
}: {
  candidate: CandidateListItem;
  onClick: () => void;
}) {
  const color = getAvatarColor(c.full_name);
  const initials = getInitials(c.full_name);

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer surface surface-hover rounded-2xl p-5"
    >
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
