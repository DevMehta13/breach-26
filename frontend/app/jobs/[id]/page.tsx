"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { JobResponse, MatchResponse, MatchResultItem } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase, MapPin, DollarSign, Clock, Search, ArrowLeft, User,
} from "lucide-react";
import { toast } from "sonner";

export default function JobDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<JobResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<MatchResultItem[]>([]);
  const [topK, setTopK] = useState(20);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api<JobResponse>(`/api/jobs/${jobId}`)
      .then(setJob)
      .catch(() => toast.error("Job not found"))
      .finally(() => setLoading(false));
  }, [user, authLoading, router, jobId]);

  async function handleMatch() {
    setMatching(true);
    try {
      const data = await api<MatchResponse>(`/api/jobs/${jobId}/match`, {
        method: "POST",
        body: JSON.stringify({ top_k: topK }),
      });
      setMatches(data.results);
      toast.success(`Found ${data.total} matching candidates`);
    } catch (e: any) {
      toast.error(e.message || "Matching failed");
    } finally { setMatching(false); }
  }

  if (authLoading || loading) return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh"><Skeleton className="h-64 w-full" /></main>
      </div>
    </div>
  );

  if (!job) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh">
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push("/jobs")}>
            <ArrowLeft className="mr-1 size-4" />Back to Jobs
          </Button>

          {/* Job Details Card */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Briefcase className="size-5 text-primary" />
                    {job.title}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {job.company}{job.department ? ` · ${job.department}` : ""}
                  </CardDescription>
                </div>
                <Badge variant={job.status === "open" ? "default" : "secondary"}>
                  {job.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {job.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>}
                {job.experience_required != null && <span className="flex items-center gap-1"><Clock className="size-3.5" />{job.experience_required}+ years</span>}
                {(job.salary_min || job.salary_max) && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="size-3.5" />
                    {job.salary_min ? `$${(job.salary_min / 1000).toFixed(0)}k` : ""}
                    {job.salary_min && job.salary_max ? " - " : ""}
                    {job.salary_max ? `$${(job.salary_max / 1000).toFixed(0)}k` : ""}
                  </span>
                )}
                <span className="capitalize">{job.employment_type?.replace("_", " ")}</span>
              </div>
              {job.skills_required && job.skills_required.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {job.skills_required.map(s => (
                    <Badge key={s} variant="outline">{s}</Badge>
                  ))}
                </div>
              )}
              {job.job_description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.job_description}</p>
              )}
            </CardContent>
          </Card>

          {/* Find Candidates Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">AI Candidate Matching</CardTitle>
                  <CardDescription>Find the best candidates for this role</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border px-2 py-1.5 text-sm"
                    value={topK}
                    onChange={e => setTopK(Number(e.target.value))}
                  >
                    <option value={3}>Top 3</option>
                    <option value={5}>Top 5</option>
                    <option value={20}>Top 20</option>
                    <option value={50}>Top 50</option>
                    <option value={100}>Top 100</option>
                  </select>
                  <Button onClick={handleMatch} disabled={matching}>
                    <Search className="mr-1 size-4" />
                    {matching ? "Matching..." : "Find Candidates"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {matches.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Click "Find Candidates" to run AI matching
                </p>
              ) : (
                <div className="space-y-3">
                  {matches.map((m, idx) => (
                    <div
                      key={m.candidate_id}
                      className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{m.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.current_title || "No title"}{m.location ? ` · ${m.location}` : ""}
                            {m.years_experience ? ` · ${m.years_experience}yr` : ""}
                          </p>
                          {m.skills && m.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {m.skills.slice(0, 4).map(s => (
                                <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className={`text-lg font-bold ${
                          m.composite_score >= 0.8 ? "text-green-600" :
                          m.composite_score >= 0.6 ? "text-amber-600" : "text-red-500"
                        }`}>
                          {(m.composite_score * 100).toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          <div>Semantic: {(m.breakdown.semantic_similarity * 100).toFixed(0)}%</div>
                          <div>Skills: {(m.breakdown.skill_match * 100).toFixed(0)}%</div>
                          <div>Exp: {(m.breakdown.experience_match * 100).toFixed(0)}%</div>
                          <div>Title: {(m.breakdown.title_relevance * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
