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
import { BarChart3 } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = [
  "#C4553A",
  "#4A8C5C",
  "#C4903A",
  "#6B8CA3",
  "#8B6B99",
  "#A0785A",
];

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api<AnalyticsOverview>("/api/analytics/overview")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  if (authLoading) return null;

  const pieData = data?.sources?.map((s) => ({
    name: s.source.replace("_", " "),
    value: s.count,
  })) ?? [];

  const barData = [...(data?.ingestion_trends ?? [])].reverse().map((t) => ({
    date: t.date.slice(5),
    count: t.count,
  }));

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh">
          <div className="mb-5 flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Analytics</h1>
          </div>

          {/* Stat row */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Total Candidates</CardDescription>
                {loading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <CardTitle className="text-3xl tabular-nums">
                    {data?.total_candidates ?? 0}
                  </CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Total Shortlists</CardDescription>
                {loading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <CardTitle className="text-3xl tabular-nums">
                    {data?.total_shortlists ?? 0}
                  </CardTitle>
                )}
              </CardHeader>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Pie: Source Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Source Breakdown</CardTitle>
                <CardDescription>Candidates by ingestion source</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="mx-auto h-52 w-52 rounded-full" />
                ) : pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {pieData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={COLORS[i % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No data yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Bar: Ingestion Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Ingestion Trends</CardTitle>
                <CardDescription>Candidates added per day (last 30 days)</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-52 w-full" />
                ) : barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#C4553A"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No data yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
