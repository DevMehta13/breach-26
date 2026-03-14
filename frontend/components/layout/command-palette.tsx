"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import type { SearchResponse } from "@/lib/types";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { MapPin, Briefcase, Search } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cmd+K / Ctrl+K handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const search = useCallback(
    (q: string) => {
      if (!q.trim() || !token) {
        setResults(null);
        return;
      }
      setLoading(true);
      api<SearchResponse>("/api/search", {
        method: "POST",
        body: JSON.stringify({ query: q.trim() }),
      })
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    },
    [token]
  );

  function handleInputChange(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 350);
  }

  function handleSelect(candidateId: string) {
    setOpen(false);
    setQuery("");
    setResults(null);
    router.push(`/candidates/${candidateId}`);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQuery("");
          setResults(null);
        }
      }}
      title="Search Candidates"
      description="Type to search candidates using natural language"
    >
      <CommandInput
        placeholder="Search candidates... (e.g. React dev in NY)"
        value={query}
        onValueChange={handleInputChange}
      />
      <CommandList>
        {!query.trim() ? (
          <CommandEmpty>
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Search className="size-5" />
              <span>Type to search candidates</span>
            </div>
          </CommandEmpty>
        ) : loading ? (
          <CommandEmpty>Searching...</CommandEmpty>
        ) : results && results.results.length > 0 ? (
          <CommandGroup heading={`${results.total} result${results.total !== 1 ? "s" : ""}`}>
            {results.results.slice(0, 8).map((c) => (
              <CommandItem
                key={c.candidate_id}
                value={`${c.full_name} ${c.current_title ?? ""}`}
                onSelect={() => handleSelect(c.candidate_id)}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.full_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {c.current_title && <span>{c.current_title}</span>}
                      {c.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="size-2.5" /> {c.location}
                        </span>
                      )}
                      {c.years_experience != null && (
                        <span className="flex items-center gap-0.5">
                          <Briefcase className="size-2.5" /> {c.years_experience}yr
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {Math.round(c.similarity_score * 100)}%
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <CommandEmpty>No candidates found.</CommandEmpty>
        )}
      </CommandList>
    </CommandDialog>
  );
}
