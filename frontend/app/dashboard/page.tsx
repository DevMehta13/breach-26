"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { AnalyticsOverview } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Briefcase, Upload, TrendingUp, Search, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    api<AnalyticsOverview>("/api/analytics/overview")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  if (authLoading) return null;

  const firstName = user?.full_name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8">
          {/* Greeting */}
          <div className="mb-8 animate-rise">
            <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
              {greeting}, <span className="terra-accent">{firstName}</span>
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Here&apos;s what&apos;s happening with your pipeline today.
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 stagger">
            <StatCard
              title="Total Candidates"
              value={data?.total_candidates}
              loading={loading}
              icon={<Users className="size-5" />}
              iconBg="bg-terra/10 text-terra"
            />
            <StatCard
              title="Total Shortlists"
              value={data?.total_shortlists}
              loading={loading}
              icon={<Briefcase className="size-5" />}
              iconBg="bg-sage/10 text-sage"
            />
            <StatCard
              title="Sources Active"
              value={data?.sources?.length}
              loading={loading}
              icon={<Upload className="size-5" />}
              iconBg="bg-[#C4903A]/10 text-[#C4903A]"
            />
            <StatCard
              title="Recent Ingestions"
              value={data?.ingestion_trends?.reduce((s, t) => s + t.count, 0)}
              loading={loading}
              icon={<TrendingUp className="size-5" />}
              iconBg="bg-[#6B8CA3]/10 text-[#6B8CA3]"
            />
          </div>

          {/* Quick actions */}
          <div className="mt-8 flex flex-wrap gap-3">
            <QuickAction href="/upload" label="Upload Resume" icon={Upload} />
            <QuickAction href="/jobs" label="Create Job" icon={Briefcase} />
            <QuickAction href="/search" label="AI Search" icon={Search} accent />
            <QuickAction href="/dedup" label="Dedup Queue" icon={TrendingUp} />
          </div>

          {/* Data panels */}
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card className="surface rounded-2xl border-0">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-display)] text-base">
                  Source Breakdown
                </CardTitle>
                <CardDescription>Candidates by ingestion source</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : data?.sources?.length ? (
                  <div className="space-y-2">
                    {data.sources.map((s, i) => {
                      const max = Math.max(...data.sources.map(x => x.count));
                      const pct = max > 0 ? (s.count / max) * 100 : 0;
                      const colors = ["bg-terra", "bg-sage", "bg-[#C4903A]", "bg-[#6B8CA3]", "bg-[#8B6B99]"];
                      return (
                        <div key={s.source} className="group rounded-lg bg-secondary/50 px-4 py-3 transition-colors hover:bg-secondary">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-sm font-medium capitalize">
                              {s.source.replace(/_/g, " ")}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">{s.count}</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-border">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ease-out ${colors[i % colors.length]}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">No candidates yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="surface rounded-2xl border-0">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-display)] text-base">
                  Ingestion Trends
                </CardTitle>
                <CardDescription>Candidates added per day</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : data?.ingestion_trends?.length ? (
                  <div className="space-y-2">
                    {data.ingestion_trends.slice(0, 7).map((t) => {
                      const max = Math.max(...data.ingestion_trends.map(x => x.count));
                      const pct = max > 0 ? (t.count / max) * 100 : 0;
                      return (
                        <div key={t.date} className="group rounded-lg bg-secondary/50 px-4 py-3 transition-colors hover:bg-secondary">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{t.date}</span>
                            <span className="text-sm font-semibold tabular-nums">{t.count}</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-border">
                            <div
                              className="score-bar h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  loading,
  icon,
  iconBg,
}: {
  title: string;
  value?: number;
  loading: boolean;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="surface surface-hover rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16 rounded-lg" />
          ) : (
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl tabular-nums tracking-tight">
              {value ?? 0}
            </p>
          )}
        </div>
        <div className={`flex size-10 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

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
      className={`group flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
        accent
          ? "terra-bg shadow-md shadow-[#C4553A]/10 hover:shadow-lg hover:shadow-[#C4553A]/20"
          : "border border-border bg-card text-foreground hover:bg-secondary hover:shadow-sm"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
      <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
    </Link>
  );
}
