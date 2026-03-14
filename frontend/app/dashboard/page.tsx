"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useWebSocket } from "@/providers/websocket-provider";
import { api } from "@/lib/api";
import type { AnalyticsOverview, ActivityLogItem } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Briefcase,
  Upload,
  TrendingUp,
  Search,
  ArrowRight,
  ArrowUpRight,
  MoreHorizontal,
  FileText,
  GitCompareArrows,
  UserPlus,
  Activity,
} from "lucide-react";
import Link from "next/link";

/* ── tiny SVG sparkline ─────────────────────────────────── */
function Sparkline({
  data,
  width = 180,
  height = 50,
  color = "var(--terra)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height * 0.8) - height * 0.1;
    return `${x},${y}`;
  });
  const linePath = `M${pts.join(" L")}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-fill)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* dot on last point */}
      {pts.length > 0 && (
        <circle
          cx={pts[pts.length - 1].split(",")[0]}
          cy={pts[pts.length - 1].split(",")[1]}
          r="3"
          fill={color}
        />
      )}
    </svg>
  );
}

/* ── donut ring chart ───────────────────────────────────── */
function DonutChart({
  segments,
  size = 120,
  strokeWidth = 14,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLen = pct * circumference;
          const gap = circumference - dashLen;
          const offset = cumulativeOffset * circumference;
          cumulativeOffset += pct;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLen} ${gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          );
        })}
      </svg>
      {/* center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums">{total}</span>
        <span className="text-[10px] text-muted-foreground">Total</span>
      </div>
    </div>
  );
}

/* ── mini bar chart ─────────────────────────────────────── */
function MiniBarChart({ data, color = "var(--terra)" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 48 }}>
      {data.map((v, i) => (
        <div
          key={i}
          className="w-[6px] rounded-t-sm transition-all duration-500"
          style={{
            height: `${Math.max((v / max) * 100, 8)}%`,
            background: i === data.length - 1 ? color : `color-mix(in srgb, ${color} 40%, var(--border))`,
          }}
        />
      ))}
    </div>
  );
}

/* ── icon map for activity ──────────────────────────────── */
const activityIcons: Record<string, React.ReactNode> = {
  candidate_created: <UserPlus className="size-3.5" />,
  resume_parsed: <FileText className="size-3.5" />,
  dedup_resolved: <GitCompareArrows className="size-3.5" />,
  search_performed: <Search className="size-3.5" />,
  shortlist_created: <Briefcase className="size-3.5" />,
  default: <Activity className="size-3.5" />,
};

const activityColors: Record<string, string> = {
  candidate_created: "bg-sage/10 text-sage",
  resume_parsed: "bg-terra/10 text-terra",
  dedup_resolved: "bg-[#6B8CA3]/10 text-[#6B8CA3]",
  search_performed: "bg-[#C4903A]/10 text-[#C4903A]",
  shortlist_created: "bg-[#8B6B99]/10 text-[#8B6B99]",
  default: "bg-secondary text-muted-foreground",
};

/* ── MAIN DASHBOARD ─────────────────────────────────────── */
export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { candidateCount } = useWebSocket();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    Promise.all([
      api<AnalyticsOverview>("/api/analytics/overview").catch(() => null),
      api<{ results: ActivityLogItem[] }>("/api/activity?limit=6").catch(() => ({ results: [] })),
    ]).then(([overview, activityData]) => {
      if (overview) setData(overview);
      setActivities(activityData.results || []);
      setLoading(false);
    });
  }, [user, authLoading, router]);

  const trendData = useMemo(
    () => data?.ingestion_trends?.map((t) => t.count) || [],
    [data]
  );

  const totalIngested = useMemo(
    () => data?.ingestion_trends?.reduce((s, t) => s + t.count, 0) ?? 0,
    [data]
  );

  const sourceSegments = useMemo(
    () =>
      (data?.sources || []).map((s, i) => ({
        value: s.count,
        color: ["var(--terra)", "var(--sage)", "#C4903A", "#6B8CA3", "#8B6B99"][i % 5],
        label: s.source.replace(/_/g, " "),
      })),
    [data]
  );

  const dayLabels = useMemo(() => {
    const days = ["S", "M", "T", "W", "T", "F", "S"];
    return data?.ingestion_trends?.slice(-7).map((t, i) => {
      const d = new Date(t.date);
      return isNaN(d.getTime()) ? days[i % 7] : days[d.getDay()];
    }) || days;
  }, [data]);

  if (authLoading) return null;

  const firstName = user?.full_name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const totalCandidates = (data?.total_candidates ?? 0) + candidateCount;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-6 lg:p-8 glass-mesh">
          {/* Greeting */}
          <div className="mb-6 animate-rise">
            <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
              {greeting}, <span className="terra-accent">{firstName}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Here&apos;s your recruitment pipeline at a glance.
            </p>
          </div>

          {/* ── TOP ROW: 3-column bento ─────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-12 stagger">
            {/* ─ Large hero stat card ─ */}
            <div className="lg:col-span-5 relative overflow-hidden rounded-2xl bg-gradient-to-br from-terra via-[#D4795A] to-[#E89A7A] p-6 text-white shadow-lg shadow-terra/10">
              <div className="absolute -right-6 -top-6 size-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-8 -left-8 size-24 rounded-full bg-black/10 blur-xl" />
              <div className="relative z-10">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium text-white/80">Total Candidates</p>
                  <button className="rounded-lg p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
                {loading ? (
                  <Skeleton className="mt-3 h-12 w-32 rounded-lg bg-white/20" />
                ) : (
                  <p className="mt-2 font-[family-name:var(--font-display)] text-5xl tabular-nums tracking-tight">
                    {totalCandidates.toLocaleString()}
                  </p>
                )}
                {/* sparkline */}
                <div className="mt-4">
                  <Sparkline data={trendData} width={220} height={50} color="rgba(255,255,255,0.7)" />
                </div>
                {/* legend */}
                <div className="mt-4 flex gap-4">
                  {sourceSegments.slice(0, 3).map((seg) => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: "rgba(255,255,255,0.6)" }}
                      />
                      <span className="text-[11px] font-medium capitalize text-white/70">
                        {seg.label}
                      </span>
                      <span className="text-[11px] font-semibold text-white/90">
                        {((seg.value / (totalCandidates || 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ─ Source breakdown donut ─ */}
            <div className="lg:col-span-3 surface rounded-2xl border-0 p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-muted-foreground">Source Breakdown</p>
                <button className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
              {loading ? (
                <div className="mt-6 flex justify-center">
                  <Skeleton className="size-[120px] rounded-full" />
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-center">
                  <DonutChart segments={sourceSegments} />
                  {/* legend below donut */}
                  <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
                    {sourceSegments.map((seg) => (
                      <div key={seg.label} className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: seg.color }} />
                        <span className="text-[11px] capitalize text-muted-foreground">
                          {seg.label}
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums">
                          {((seg.value / (totalCandidates || 1)) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ─ Right stacked cards ─ */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {/* Shortlists */}
              <div className="surface surface-hover flex-1 rounded-2xl border-0 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-sage/10 font-[family-name:var(--font-display)] text-lg font-bold text-sage tabular-nums">
                      {loading ? "–" : data?.total_shortlists ?? 0}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Shortlists</p>
                      <p className="text-[11px] text-muted-foreground">Active lists</p>
                    </div>
                  </div>
                  <Link
                    href="/shortlists"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-sage transition-all duration-700"
                    style={{ width: `${Math.min(((data?.total_shortlists ?? 0) / 10) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Pipeline trend chart */}
              <div className="surface surface-hover flex-1 rounded-2xl border-0 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">Pipeline Trend</p>
                    <p className="text-[11px] text-muted-foreground">Last 7 days</p>
                  </div>
                  <button className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="flex-1">
                    {loading ? (
                      <Skeleton className="h-12 w-full rounded-lg" />
                    ) : (
                      <MiniBarChart data={trendData.slice(-7)} color="var(--terra)" />
                    )}
                    <div className="mt-1.5 flex justify-between">
                      {dayLabels.map((d, i) => (
                        <span key={i} className="text-[9px] font-medium text-muted-foreground">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── BOTTOM ROW ──────────────────────────────────── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            {/* ─ Activity feed (left, wider) ─ */}
            <div className="lg:col-span-7 surface rounded-2xl border-0 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">
                    Recent Activity
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Latest pipeline actions</p>
                </div>
                <Link
                  href="/activity"
                  className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
                >
                  View All
                  <ArrowRight className="size-3" />
                </Link>
              </div>

              <div className="mt-4 space-y-1">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
                      <Skeleton className="size-8 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-3/4 rounded" />
                        <Skeleton className="h-2.5 w-1/3 rounded" />
                      </div>
                    </div>
                  ))
                ) : activities.length > 0 ? (
                  activities.map((act) => {
                    const actionKey = act.action?.toLowerCase().replace(/\s+/g, "_") || "default";
                    const iconColorClass = activityColors[actionKey] || activityColors.default;
                    const icon = activityIcons[actionKey] || activityIcons.default;
                    const meta = act.metadata as Record<string, string> | null;
                    const entityLabel =
                      meta?.candidate_name || meta?.name || meta?.title || act.entity_type || "—";
                    const timeAgo = getTimeAgo(act.created_at);

                    return (
                      <div
                        key={act.id}
                        className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/60"
                      >
                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconColorClass}`}>
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {formatAction(act.action)}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground capitalize">
                            {entityLabel}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-right">
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                            {act.entity_type?.replace(/_/g, " ") || "—"}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {timeAgo}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Activity className="mb-2 size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No activity yet</p>
                    <p className="mt-0.5 text-xs text-muted-foreground/60">
                      Upload resumes to get started
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ─ Right stacked stats ─ */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Ingestions count */}
              <div className="surface surface-hover flex-1 rounded-2xl border-0 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Recent Ingestions</p>
                    <p className="text-[11px] text-muted-foreground/60">This week</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-3.5 text-sage" />
                    <span className="text-xs font-medium text-sage">Active</span>
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="mt-3 h-10 w-20 rounded-lg" />
                ) : (
                  <p className="mt-2 font-[family-name:var(--font-display)] text-4xl tabular-nums tracking-tight">
                    {totalIngested}
                  </p>
                )}
              </div>

              {/* Quick actions card */}
              <div className="surface rounded-2xl border-0 p-5">
                <p className="text-sm font-semibold">Quick Actions</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <QuickAction href="/upload" label="Upload" icon={Upload} />
                  <QuickAction href="/search" label="AI Search" icon={Search} accent />
                  <QuickAction href="/jobs" label="New Job" icon={Briefcase} />
                  <QuickAction href="/dedup" label="Dedup" icon={GitCompareArrows} />
                </div>
              </div>

              {/* Sources active */}
              <div className="surface surface-hover flex-1 rounded-2xl border-0 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Sources Active</p>
                  </div>
                  <Link
                    href="/upload"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </div>
                {loading ? (
                  <Skeleton className="mt-3 h-10 w-14 rounded-lg" />
                ) : (
                  <div className="mt-1 flex items-end gap-3">
                    <p className="font-[family-name:var(--font-display)] text-4xl tabular-nums tracking-tight text-[#C4903A]">
                      {data?.sources?.length ?? 0}
                    </p>
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {data?.sources?.map((s) => (
                        <span
                          key={s.source}
                          className="rounded-full bg-[#C4903A]/10 px-2 py-0.5 text-[10px] font-medium capitalize text-[#C4903A]"
                        >
                          {s.source.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */
function QuickAction({
  href,
  label,
  icon: Icon,
  accent,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
        accent
          ? "terra-bg shadow-md shadow-terra/10 hover:shadow-lg hover:shadow-terra/20"
          : "bg-secondary text-foreground hover:bg-accent hover:shadow-sm"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
      <ArrowRight className="ml-auto size-3 opacity-0 transition-all group-hover:opacity-60" />
    </Link>
  );
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
