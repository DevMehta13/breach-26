"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { ShortlistDetailResponse } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users } from "lucide-react";

export default function ShortlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ShortlistDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api<ShortlistDetailResponse>(`/api/shortlists/${id}`)
      .then(setData)
      .catch(() => router.push("/shortlists"))
      .finally(() => setLoading(false));
  }, [id, user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col pl-[220px]">
          <Topbar />
          <main className="flex-1 p-8 space-y-4 glass-mesh">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48 w-full" />
          </main>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4"
            onClick={() => router.push("/shortlists")}
          >
            <ArrowLeft className="size-3.5" /> Back
          </Button>

          <div className="mb-5">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">{data.name}</h1>
            {data.description && (
              <p className="text-sm text-muted-foreground">{data.description}</p>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="size-3.5" />
              {data.candidate_count} candidate{data.candidate_count !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.candidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No candidates in this shortlist yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.candidates.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/candidates/${c.candidate_id}`)}
                    >
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                      <TableCell>{c.current_title ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.notes ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(c.added_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </main>
      </div>
    </div>
  );
}
