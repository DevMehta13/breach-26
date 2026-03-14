"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { CandidateDetail } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/ui/score-ring";
import { ArrowLeft, Mail, Phone, MapPin, Linkedin, Briefcase, Users, GraduationCap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "needs_review", label: "Needs Review" },
  { value: "pending", label: "Pending" },
  { value: "ingested", label: "Ingested" },
  { value: "pending_review", label: "Pending Review" },
];

interface SimilarCandidate {
  candidate_id: string;
  full_name: string;
  current_title: string | null;
  location: string | null;
  years_experience: number | null;
  skills: string[];
  similarity_pct: number;
}

const AVATAR_COLORS = [
  "bg-terra text-white",
  "bg-sage text-white",
  "bg-[#C4903A] text-white",
  "bg-[#6B8CA3] text-white",
  "bg-[#8B6B99] text-white",
  "bg-muted-foreground text-white",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [similar, setSimilar] = useState<SimilarCandidate[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarSearched, setSimilarSearched] = useState(false);
  const similarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api<CandidateDetail>(`/api/candidates/${id}`)
      .then(setCandidate)
      .catch(() => router.push("/candidates"))
      .finally(() => setLoading(false));
    setSimilar([]);
    setSimilarSearched(false);
  }, [id, user, authLoading, router]);

  async function handleFindSimilar() {
    setSimilarLoading(true);
    setSimilarSearched(true);
    try {
      const data = await api<{ results: SimilarCandidate[] }>(
        `/api/candidates/${id}/similar?limit=10&threshold=0.65`
      );
      setSimilar(data.results);
      if (data.results.length === 0) {
        toast.info("No similar candidates found");
      } else {
        toast.success(`Found ${data.results.length} similar candidate${data.results.length !== 1 ? "s" : ""}`);
        setTimeout(() => {
          similarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    } catch {
      toast.error("Failed to search similar candidates");
    } finally {
      setSimilarLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col pl-[220px]">
          <Topbar />
          <main className="flex-1 space-y-6 p-8 glass-mesh">
            <Skeleton className="h-8 w-64 rounded-lg" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </main>
        </div>
      </div>
    );
  }

  if (!candidate) return null;
  const c = candidate;
  const initials = c.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const avatarColor = getAvatarColor(c.full_name);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh">
          {/* Top bar */}
          <div className="mb-6 flex items-center justify-between animate-rise">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/candidates")}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleFindSimilar}
              disabled={similarLoading}
              className="terra-bg gap-2 rounded-lg border-0 shadow-md shadow-[#C4553A]/15"
            >
              <Users className="size-4" />
              {similarLoading ? "Searching..." : "Find Similar"}
            </Button>
          </div>

          {/* Hero card */}
          <div className="surface rounded-2xl p-6">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className={`flex size-16 shrink-0 items-center justify-center rounded-2xl text-lg font-bold shadow-sm ${avatarColor}`}>
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                  {c.full_name}
                </h1>
                {c.current_title && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{c.current_title}</p>
                )}
                {/* Contact pills */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.email && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                      <Mail className="size-3" /> {c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                      <Phone className="size-3" /> {c.phone}
                    </span>
                  )}
                  {c.location && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {c.location}
                    </span>
                  )}
                  {c.linkedin_url && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                      <Linkedin className="size-3" /> LinkedIn
                    </span>
                  )}
                  {c.years_experience != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                      <Briefcase className="size-3" /> {c.years_experience} yrs
                    </span>
                  )}
                </div>
                {/* Status + Source + Confidence */}
                <div className="mt-3 flex items-center gap-3">
                  <Badge variant="secondary" className="rounded-full capitalize">{c.source.replace(/_/g, " ")}</Badge>
                  <select
                    className="cursor-pointer appearance-none rounded-full border-0 bg-secondary px-3 py-1 text-xs font-medium outline-none transition-colors hover:bg-muted"
                    value={c.ingestion_status}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      try {
                        const updated = await api<CandidateDetail>(`/api/candidates/${id}`, {
                          method: "PUT",
                          body: JSON.stringify({ ingestion_status: newStatus }),
                        });
                        setCandidate(updated);
                        toast.success(`Status changed to "${newStatus.replace(/_/g, " ")}"`);
                      } catch {
                        toast.error("Failed to update status");
                      }
                    }}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {c.confidence_score != null && (
                    <ScoreRing score={Math.round(c.confidence_score * 100)} size={36} strokeWidth={3} label="conf" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Content grid */}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* Summary */}
            {c.summary && (
              <Card className="surface lg:col-span-2 overflow-hidden rounded-2xl border-0">
                <div className="flex">
                  <div className="w-1 score-bar shrink-0" />
                  <div className="flex-1">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)]">
                        <Sparkles className="size-4 terra-accent" />
                        AI Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
                    </CardContent>
                  </div>
                </div>
              </Card>
            )}

            {/* Skills */}
            {c.skills && c.skills.length > 0 && (
              <Card className="surface rounded-2xl border-0">
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-display)]">Skills</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {c.skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-terra/10 px-3 py-1 text-xs font-medium text-terra ring-1 ring-inset ring-terra/15">
                        {skill}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Experience */}
            {c.experience && c.experience.length > 0 && (
              <Card className="surface rounded-2xl border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)]">
                    <Briefcase className="size-4 text-muted-foreground" />
                    Experience
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative space-y-4">
                    <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
                    {c.experience.map((exp, i) => (
                      <div key={i} className="relative pl-6">
                        <div className="absolute left-0 top-1.5 size-[15px] rounded-full border-2 border-terra/40 bg-card" />
                        <p className="text-sm font-medium">
                          {exp.title}
                          {exp.company && (
                            <span className="font-normal text-muted-foreground"> at {exp.company}</span>
                          )}
                        </p>
                        {exp.duration && (
                          <p className="text-xs text-muted-foreground/70">{exp.duration}</p>
                        )}
                        {exp.description && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{exp.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Education */}
            {c.education && c.education.length > 0 && (
              <Card className="surface rounded-2xl border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)]">
                    <GraduationCap className="size-4 text-muted-foreground" />
                    Education
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {c.education.map((edu, i) => (
                      <div key={i} className="rounded-lg bg-secondary/50 p-3">
                        <p className="text-sm font-medium">{edu.degree}</p>
                        {edu.institution && (
                          <p className="text-xs text-muted-foreground">
                            {edu.institution}{edu.year && ` · ${edu.year}`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Similar Candidates */}
          <div ref={similarRef} className="mt-8">
            {similarLoading && (
              <Card className="surface rounded-2xl border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)]">
                    <Users className="size-4" /> Similar Candidates
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
                </CardContent>
              </Card>
            )}

            {!similarLoading && similarSearched && similar.length > 0 && (
              <Card className="surface rounded-2xl border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)]">
                    <Users className="size-4 terra-accent" /> Similar Candidates
                  </CardTitle>
                  <CardDescription>
                    {similar.length} similar profile{similar.length !== 1 ? "s" : ""} found
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
                  {similar.map(s => (
                    <div
                      key={s.candidate_id}
                      className="cursor-pointer rounded-xl border border-border/50 bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-terra/30 hover:shadow-md"
                      onClick={() => router.push(`/candidates/${s.candidate_id}`)}
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold">{s.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{s.current_title || "No title"}</p>
                        </div>
                        <ScoreRing score={Math.round(s.similarity_pct)} size={40} strokeWidth={3} />
                      </div>
                      {(s.location || s.years_experience != null) && (
                        <p className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                          {s.location && <><MapPin className="size-3" />{s.location}</>}
                          {s.years_experience != null && <span>{s.location ? " · " : ""}{s.years_experience}yr</span>}
                        </p>
                      )}
                      {s.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.skills.slice(0, 3).map(sk => (
                            <span key={sk} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground/85">{sk}</span>
                          ))}
                          {s.skills.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{s.skills.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!similarLoading && similarSearched && similar.length === 0 && (
              <Card className="surface rounded-2xl border-0">
                <CardContent className="py-10 text-center">
                  <Users className="mx-auto mb-2 size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No similar candidates found above the threshold.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
