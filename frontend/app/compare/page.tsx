"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { JobResponse, CandidateListItem, CompareResponse, CompareCandidate } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function ComparePage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [selectedJob, setSelectedJob] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    Promise.all([
      api<JobResponse[]>("/api/jobs"),
      api<{ results: CandidateListItem[] }>("/api/candidates?limit=100"),
    ]).then(([j, c]) => {
      setJobs(j);
      setCandidates(c.results);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user, authLoading, router]);

  function toggleCandidate(id: string) {
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCompare() {
    if (!selectedJob) { toast.error("Select a job first"); return; }
    if (selectedCandidates.size < 2) { toast.error("Select at least 2 candidates"); return; }
    setComparing(true);
    try {
      const data = await api<CompareResponse>(`/api/jobs/${selectedJob}/compare`, {
        method: "POST",
        body: JSON.stringify({ candidate_ids: Array.from(selectedCandidates) }),
      });
      setComparison(data);
    } catch (e: any) {
      toast.error(e.message || "Compare failed");
    } finally { setComparing(false); }
  }

  if (authLoading) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8">
          <div className="mb-5 flex items-center gap-2">
            <ArrowLeftRight className="size-5 text-primary" />
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Candidate Comparison</h1>
          </div>

          {loading ? <Skeleton className="h-64 w-full" /> : (
            <>
              {/* Selection Row */}
              <Card className="mb-6">
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Select Job</label>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={selectedJob}
                      onChange={e => { setSelectedJob(e.target.value); setComparison(null); }}
                    >
                      <option value="">-- Choose a job --</option>
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>{j.title}{j.company ? ` (${j.company})` : ""}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Select Candidates ({selectedCandidates.size} selected)
                    </label>
                    <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                      {candidates.map(c => (
                        <div
                          key={c.id}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                            selectedCandidates.has(c.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          }`}
                          onClick={() => toggleCandidate(c.id)}
                        >
                          <div className={`size-4 rounded border flex items-center justify-center ${
                            selectedCandidates.has(c.id) ? "bg-primary border-primary" : ""
                          }`}>
                            {selectedCandidates.has(c.id) && <Check className="size-3 text-white" />}
                          </div>
                          <span className="font-medium">{c.full_name}</span>
                          <span className="text-muted-foreground">
                            {c.current_title || ""}{c.location ? ` · ${c.location}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button onClick={handleCompare} disabled={comparing || !selectedJob || selectedCandidates.size < 2}>
                    {comparing ? "Comparing..." : "Compare Candidates"}
                  </Button>
                </CardContent>
              </Card>

              {/* Comparison Table */}
              {comparison && comparison.candidates.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Comparison for: {comparison.job_title}
                    </CardTitle>
                    <CardDescription>{comparison.candidates.length} candidates compared</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="py-2 px-3 text-left font-medium">Candidate</th>
                            <th className="py-2 px-3 text-left font-medium">Title</th>
                            <th className="py-2 px-3 text-center font-medium">Experience</th>
                            <th className="py-2 px-3 text-center font-medium">Semantic Match</th>
                            <th className="py-2 px-3 text-center font-medium">Skill Overlap</th>
                            <th className="py-2 px-3 text-center font-medium">Exp Score</th>
                            <th className="py-2 px-3 text-left font-medium">Education</th>
                            <th className="py-2 px-3 text-left font-medium">Companies</th>
                            <th className="py-2 px-3 text-center font-medium">Overall</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.candidates.map((c, i) => (
                            <tr key={c.candidate_id} className={i % 2 ? "bg-muted/30" : ""}>
                              <td className="py-2 px-3 font-medium">{c.full_name}</td>
                              <td className="py-2 px-3 text-muted-foreground">{c.current_title || "-"}</td>
                              <td className="py-2 px-3 text-center">{c.years_experience ? `${c.years_experience}yr` : "-"}</td>
                              <td className="py-2 px-3 text-center">
                                <ScoreBadge score={c.semantic_match} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <ScoreBadge score={c.skill_overlap} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <ScoreBadge score={c.experience_score} />
                              </td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">
                                {c.education && c.education.length > 0
                                  ? c.education.map(e => `${e.degree || ""} ${e.institution || ""}`).join(", ")
                                  : "-"}
                              </td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">
                                {c.experience && c.experience.length > 0
                                  ? [...new Set(c.experience.map(e => e.company).filter(Boolean))].join(", ")
                                  : "-"}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className={`text-base font-bold ${
                                  c.overall_score >= 0.8 ? "text-green-600" :
                                  c.overall_score >= 0.6 ? "text-amber-600" : "text-red-500"
                                }`}>
                                  {(c.overall_score * 100).toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = (score * 100).toFixed(0);
  const color = score >= 0.8 ? "bg-green-100 text-green-700" :
    score >= 0.6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{pct}%</span>;
}
