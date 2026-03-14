"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { ActivityLogResponse, ActivityLogItem } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity as ActivityIcon,
  Plus,
  Merge,
  Trash2,
  Upload,
  UserPlus,
  ListPlus,
  CircleDot,
} from "lucide-react";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  created_shortlist: <ListPlus className="size-3.5" />,
  added_to_shortlist: <UserPlus className="size-3.5" />,
  removed_from_shortlist: <Trash2 className="size-3.5" />,
  merged_candidates: <Merge className="size-3.5" />,
  uploaded_resume: <Upload className="size-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
  created_shortlist: "Created shortlist",
  added_to_shortlist: "Added candidate to shortlist",
  removed_from_shortlist: "Removed candidate from shortlist",
  merged_candidates: "Merged duplicate candidates",
  uploaded_resume: "Uploaded resume",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export default function ActivityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ActivityLogResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api<ActivityLogResponse>("/api/activity")
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
        <main className="flex-1 p-8">
          <div className="mb-5 flex items-center gap-2">
            <ActivityIcon className="size-5 text-primary" />
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Activity Log</h1>
            {data && (
              <Badge variant="secondary">{data.total} events</Badge>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !data?.results?.length ? (
            <div className="py-16 text-center">
              <ActivityIcon className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No activity recorded yet.
              </p>
            </div>
          ) : (
            <div className="relative ml-4 border-l pl-6">
              {data.results.map((item) => (
                <TimelineItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function TimelineItem({ item }: { item: ActivityLogItem }) {
  const icon = ACTION_ICONS[item.action] ?? <CircleDot className="size-3.5" />;
  const label = ACTION_LABELS[item.action] ?? item.action.replace(/_/g, " ");
  const meta = item.metadata ?? {};

  return (
    <div className="relative pb-6 last:pb-0">
      {/* Dot on timeline */}
      <div className="absolute -left-[calc(1.5rem+0.5px)] top-1 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground">
        {icon}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          <span className="text-xs text-muted-foreground">{formatTime(item.created_at)}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">{item.entity_type}</Badge>
          {typeof meta.name === "string" && <span>{meta.name}</span>}
          {typeof meta.candidate_name === "string" && (
            <span>{meta.candidate_name}</span>
          )}
        </div>
      </div>
    </div>
  );
}
