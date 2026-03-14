"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { ReferralAnalytics } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, ArrowLeft, TrendingUp, Users, Trophy } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  FunnelChart, Funnel, LabelList,
} from "recharts";

const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(262, 83%, 58%)",
  "hsl(330, 81%, 60%)",
  "hsl(174, 72%, 40%)",
  "hsl(43, 96%, 56%)",
  "hsl(0, 84%, 60%)",
];

const FUNNEL_COLORS = ["#3b82f6", "#8b5cf6", "#a855f7", "#22c55e", "#ef4444"];

export default function ReferralAnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ReferralAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api<ReferralAnalytics>("/api/referrals/analytics")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  if (authLoading) return null;

  const funnelData = data?.status_breakdown
    ?.sort((a, b) => {
      const order = ["referred", "under_review", "interview", "hired", "rejected"];
      return order.indexOf(a.status) - order.indexOf(b.status);
    })
    .map(s => ({
      name: s.status.replace("_", " "),
      value: s.count,
    })) ?? [];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push("/referrals")}>
            <ArrowLeft className="mr-1 size-4" />Back to Referrals
          </Button>

          <div className="mb-5 flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Referral Analytics</h1>
          </div>

          {/* Stat Cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1">
                  <Users className="size-3.5" />Total Referrals
                </CardDescription>
                {loading ? <Skeleton className="h-8 w-20" /> : (
                  <CardTitle className="text-3xl tabular-nums">{data?.total_referrals ?? 0}</CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1">
                  <Trophy className="size-3.5" />Total Hires
                </CardDescription>
                {loading ? <Skeleton className="h-8 w-20" /> : (
                  <CardTitle className="text-3xl tabular-nums">{data?.total_hires ?? 0}</CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1">
                  <TrendingUp className="size-3.5" />Success Rate
                </CardDescription>
                {loading ? <Skeleton className="h-8 w-20" /> : (
                  <CardTitle className="text-3xl tabular-nums">{data?.success_rate ?? 0}%</CardTitle>
                )}
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top Referrers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Referrers</CardTitle>
                <CardDescription>Employees with the most referrals</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-52 w-full" /> :
                  data?.top_referrers && data.top_referrers.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data.top_referrers}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="referral_count" name="Referrals" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="hires" name="Hires" fill="hsl(174, 72%, 40%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>
                  )}
              </CardContent>
            </Card>

            {/* Referral Funnel (Status Breakdown) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Referral Funnel</CardTitle>
                <CardDescription>Status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-52 w-full" /> :
                  funnelData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={funnelData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip />
                        <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]}>
                          {funnelData.map((_, i) => (
                            <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>
                  )}
              </CardContent>
            </Card>

            {/* Department Breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Department Breakdown</CardTitle>
                <CardDescription>Referrals by referring employee's department</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="mx-auto h-52 w-52 rounded-full" /> :
                  data?.department_breakdown && data.department_breakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={data.department_breakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="count"
                          nameKey="department"
                          label={({ department, percent }: { department?: string; percent?: number }) =>
                            `${department ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {data.department_breakdown.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>
                  )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
