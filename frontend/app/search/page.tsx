"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { SearchResponse, SearchResultItem } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/ui/score-ring";
import { Search as SearchIcon, Loader2, MapPin, Briefcase, X, Zap } from "lucide-react";

export default function SearchPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  if (!authLoading && !user) {
    router.push("/login");
    return null;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api<SearchResponse>("/api/search", {
        method: "POST",
        body: JSON.stringify({ query: query.trim() }),
      });
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8">
          {/* Hero search area */}
          <div className={`mx-auto transition-all duration-500 ${searched ? "max-w-full" : "max-w-2xl pt-16"}`}>
            {!searched && (
              <div className="mb-8 text-center animate-rise">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-terra/10">
                  <SearchIcon className="size-7 terra-accent" />
                </div>
                <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
                  Find your perfect <span className="terra-accent">candidate</span>
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Search in natural language — our AI understands skills, experience, and location
                </p>
              </div>
            )}

            {/* Search bar */}
            <form onSubmit={handleSearch} className="relative">
              <div className="relative">
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                  {loading ? (
                    <Loader2 className="size-5 animate-spin terra-accent" />
                  ) : (
                    <SearchIcon className="size-5 text-muted-foreground" />
                  )}
                </div>
                <input
                  type="text"
                  className="w-full rounded-xl border border-border bg-card py-4 pl-12 pr-4 text-[15px] shadow-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-terra/30 focus:shadow-md focus:ring-2 focus:ring-terra/10"
                  placeholder='Try "Senior React developer in New York with 5+ years"'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setResult(null); setSearched(false); }}
                    className="absolute right-16 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg terra-bg px-4 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                >
                  {loading ? "..." : "Search"}
                </button>
              </div>
            </form>

            {/* Suggested searches */}
            {!searched && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  "Python developer in New York",
                  "Senior React engineer",
                  "AWS with 10+ years",
                  "ML engineer",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setQuery(s); }}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-all hover:bg-secondary hover:shadow-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Intent pills */}
          {result?.intent && searched && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Zap className="size-3.5 terra-accent" />
              <span className="text-xs font-medium text-muted-foreground">AI parsed:</span>
              <IntentPills intent={result.intent} />
            </div>
          )}

          {/* Results */}
          {loading ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="surface rounded-2xl p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-12 rounded-xl" />
                    <div>
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="mt-1.5 h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-3 w-full" />
                  <div className="mt-3 flex gap-1.5">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : result ? (
            <>
              <p className="mt-6 text-sm text-muted-foreground">
                {result.total} result{result.total !== 1 ? "s" : ""} found
              </p>
              {result.results.length > 0 ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
                  {result.results.map((c) => (
                    <ResultCard
                      key={c.candidate_id}
                      candidate={c}
                      onClick={() => router.push(`/candidates/${c.candidate_id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-16">
                  <SearchIcon className="mb-3 size-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">No matches found</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try adjusting your query</p>
                </div>
              )}
            </>
          ) : searched ? (
            <div className="flex flex-col items-center py-16">
              <p className="text-sm text-muted-foreground">Search failed. Please try again.</p>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function IntentPills({ intent }: { intent: Record<string, unknown> }) {
  const skills = Array.isArray(intent.skills) ? (intent.skills as string[]) : [];
  const location = typeof intent.location === "string" ? intent.location : "";
  const minExp = typeof intent.min_experience_years === "number" ? intent.min_experience_years : 0;
  const maxExp = typeof intent.max_experience_years === "number" ? intent.max_experience_years : 0;

  return (
    <>
      {skills.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-full bg-terra/10 px-2.5 py-1 text-[11px] font-medium text-terra ring-1 ring-inset ring-terra/20">
          <Zap className="size-2.5" />
          {s}
        </span>
      ))}
      {location && (
        <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2.5 py-1 text-[11px] font-medium text-sage ring-1 ring-inset ring-sage/20">
          <MapPin className="size-2.5" />
          {location}
        </span>
      )}
      {minExp > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#C4903A]/10 px-2.5 py-1 text-[11px] font-medium text-[#C4903A] ring-1 ring-inset ring-[#C4903A]/20">
          <Briefcase className="size-2.5" />
          {minExp}+ years
        </span>
      )}
      {maxExp > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive ring-1 ring-inset ring-destructive/20">
          <Briefcase className="size-2.5" />
          &lt;{maxExp} years
        </span>
      )}
    </>
  );
}

function ResultCard({
  candidate: c,
  onClick,
}: {
  candidate: SearchResultItem;
  onClick: () => void;
}) {
  const score = Math.round(c.similarity_score * 100);

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer surface surface-hover rounded-2xl p-5"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-display)] text-[15px] font-semibold">
            {c.full_name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {c.current_title || "No title"}
          </p>
        </div>
        <ScoreRing score={score} size={48} strokeWidth={3} />
      </div>

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
      </div>

      {c.skills && c.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground/85"
            >
              {skill}
            </span>
          ))}
          {c.skills.length > 5 && (
            <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
              +{c.skills.length - 5}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
