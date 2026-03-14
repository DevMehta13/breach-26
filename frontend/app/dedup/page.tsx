"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useWebSocket } from "@/providers/websocket-provider";
import { api } from "@/lib/api";
import type {
  DedupQueueListItem,
  DedupQueueItem,
  DedupActionResponse,
} from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  GitCompareArrows,
  Merge,
  X,
  ChevronRight,
  ArrowLeft,
  ScanSearch,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

type StatusFilter = "pending" | "merged" | "dismissed";

export default function DedupQueuePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { lastMessage, isConnected } = useWebSocket();
  const router = useRouter();
  const [queue, setQueue] = useState<DedupQueueListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DedupQueueItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    pairs_checked: number;
    new_duplicates_found: number;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const prevMsgRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const prevQueueIdsRef = useRef<Set<string>>(new Set());

  // Fetch queue when auth ready or filter changes
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    // Reset previous IDs on tab switch to prevent false "new" detection
    prevQueueIdsRef.current = new Set();
    doFetch(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, router, statusFilter]);

  // Real-time: auto-refresh when relevant WS messages arrive
  useEffect(() => {
    if (!lastMessage) return;
    // Deduplicate using a serialized key
    const msgKey = `${lastMessage.type}_${lastMessage.action ?? ""}_${lastMessage.candidate_id ?? ""}_${lastMessage.score ?? ""}`;
    if (msgKey === prevMsgRef.current) return;
    prevMsgRef.current = msgKey;

    const shouldRefresh =
      lastMessage.type === "DEDUP_UPDATE" ||
      (lastMessage.type === "INGESTION_COMPLETE" &&
        lastMessage.status === "pending_review");

    if (shouldRefresh) {
      doFetch(statusFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage, statusFilter]);

  async function doFetch(filter: string) {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await api<DedupQueueListItem[]>(
        `/api/dedup/queue?status_filter=${filter}`
      );
      // Detect genuinely new items (only when we have prior state for same tab)
      if (prevQueueIdsRef.current.size > 0) {
        const fresh = new Set<string>();
        for (const item of data) {
          if (!prevQueueIdsRef.current.has(item.id)) fresh.add(item.id);
        }
        if (fresh.size > 0) {
          setNewItemIds(fresh);
          setTimeout(() => setNewItemIds(new Set()), 3000);
        }
      }
      // Update tracking set
      prevQueueIdsRef.current = new Set(data.map((i) => i.id));
      setQueue(data);
    } catch {
      /* empty */
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }

  async function selectItem(id: string) {
    setDetailLoading(true);
    try {
      const data = await api<DedupQueueItem>(`/api/dedup/queue/${id}`);
      setSelected(data);
    } catch {
      toast.error("Failed to load comparison");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleMerge() {
    if (!selected) return;
    setActing(true);
    try {
      const res = await api<DedupActionResponse>(
        `/api/dedup/queue/${selected.id}/merge`,
        { method: "POST", body: JSON.stringify({}) }
      );
      toast.success(res.message);
      setQueue((q) => q.filter((i) => i.id !== selected.id));
      setSelected(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setActing(false);
    }
  }

  async function handleDismiss() {
    if (!selected) return;
    setActing(true);
    try {
      const res = await api<DedupActionResponse>(
        `/api/dedup/queue/${selected.id}/dismiss`,
        { method: "POST" }
      );
      toast.success(res.message);
      setQueue((q) => q.filter((i) => i.id !== selected.id));
      setSelected(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Dismiss failed");
    } finally {
      setActing(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await api<{
        total_candidates: number;
        pairs_checked: number;
        new_duplicates_found: number;
      }>("/api/dedup/scan", { method: "POST" });
      setScanResult(res);
      if (res.new_duplicates_found > 0) {
        toast.success(
          `Scan complete: ${res.new_duplicates_found} new duplicates found`,
          { description: `Checked ${res.pairs_checked} candidate pairs` }
        );
        doFetch(statusFilter);
      } else {
        toast.info("Scan complete: no new duplicates found", {
          description: `Checked ${res.pairs_checked} candidate pairs`,
        });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  if (authLoading) return null;

  const statusTabs: { key: StatusFilter; label: string; icon: React.ReactNode }[] = [
    { key: "pending", label: "Pending", icon: <Clock className="size-3.5" /> },
    { key: "merged", label: "Merged", icon: <CheckCircle2 className="size-3.5" /> },
    { key: "dismissed", label: "Dismissed", icon: <XCircle className="size-3.5" /> },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitCompareArrows className="size-5 text-primary" />
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Dedup Queue</h1>
              {!loading && statusFilter === "pending" && (
                <Badge
                  variant={queue.length > 0 ? "default" : "secondary"}
                  className={queue.length > 0 ? "animate-pulse" : ""}
                >
                  {queue.length} pending
                </Badge>
              )}
              {/* Live indicator */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {isConnected ? (
                  <>
                    <Wifi className="size-3 text-green-500" />
                    <span className="text-green-600">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3 text-red-400" />
                    <span className="text-red-500">Offline</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Manual refresh */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => doFetch(statusFilter)}
                disabled={loading}
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              {/* Retroactive scan button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="size-3.5" />
                )}
                {scanning ? "Scanning..." : "Run Full Scan"}
              </Button>
            </div>
          </div>

          {/* Scan result banner */}
          {scanResult && (
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium">
                Scan Results:{" "}
                <span className="text-primary">
                  {scanResult.new_duplicates_found} new duplicates
                </span>{" "}
                found across {scanResult.pairs_checked} pairs checked
              </p>
            </div>
          )}

          {/* Status filter tabs */}
          <div className="mb-4 flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setSelected(null);
                  setLoading(true);
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === tab.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {selected ? (
            <ComparisonView
              item={selected}
              loading={detailLoading}
              acting={acting}
              onMerge={handleMerge}
              onDismiss={handleDismiss}
              onBack={() => setSelected(null)}
            />
          ) : loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="py-16 text-center">
              <GitCompareArrows className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {statusFilter === "pending"
                  ? "No pending duplicates to review"
                  : statusFilter === "merged"
                    ? "No merged pairs yet"
                    : "No dismissed pairs yet"}
              </p>
              {statusFilter === "pending" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleScan}
                  disabled={scanning}
                >
                  {scanning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ScanSearch className="size-3.5" />
                  )}
                  Scan for missed duplicates
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => {
                const isNew = newItemIds.has(item.id);
                return (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/20 ${
                      isNew
                        ? "ring-2 ring-primary/40 shadow-md shadow-primary/10 animate-[pulse_1s_ease-in-out_2]"
                        : ""
                    } ${
                      statusFilter !== "pending"
                        ? "opacity-80"
                        : ""
                    }`}
                    onClick={() => selectItem(item.id)}
                  >
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        {isNew && (
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-primary" />
                          </span>
                        )}
                        <div className="text-sm">
                          <span className="font-medium">
                            {item.candidate_a_name}
                          </span>
                          <span className="mx-2 text-muted-foreground">
                            &harr;
                          </span>
                          <span className="font-medium">
                            {item.candidate_b_name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {statusFilter !== "pending" && (
                          <Badge
                            variant={
                              item.status === "merged"
                                ? "default"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {item.status === "merged" ? (
                              <CheckCircle2 className="mr-1 size-3" />
                            ) : (
                              <XCircle className="mr-1 size-3" />
                            )}
                            {item.status}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            item.composite_score >= 0.85
                              ? "default"
                              : item.composite_score >= 0.50
                                ? "secondary"
                                : "outline"
                          }
                          className={
                            item.composite_score >= 0.85
                              ? "bg-red-500/90 hover:bg-red-500"
                              : ""
                          }
                        >
                          {(item.composite_score * 100).toFixed(0)}% match
                        </Badge>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ComparisonView({
  item,
  loading,
  acting,
  onMerge,
  onDismiss,
  onBack,
}: {
  item: DedupQueueItem;
  loading: boolean;
  acting: boolean;
  onMerge: () => void;
  onDismiss: () => void;
  onBack: () => void;
}) {
  const a = item.candidate_a;
  const b = item.candidate_b;
  const isResolved = item.status !== "pending";

  // Normalize values for smart comparison (not display)
  function norm(val: string): string {
    return val.toLowerCase().trim().replace(/\s+/g, " ");
  }
  function normLinkedIn(url: string): string {
    // Strip protocol, www, trailing slash to compare slugs
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  }
  function normPhone(phone: string): string {
    return phone.replace(/\D/g, "").slice(-10);
  }

  type FieldCompare = "exact" | "normalize" | "linkedin" | "phone" | "none";
  const fields: {
    label: string;
    aVal: string;
    bVal: string;
    compare: FieldCompare;
  }[] = [
    { label: "Email", aVal: a.email ?? "\u2014", bVal: b.email ?? "\u2014", compare: "normalize" },
    { label: "Phone", aVal: a.phone ?? "\u2014", bVal: b.phone ?? "\u2014", compare: "phone" },
    { label: "Location", aVal: a.location ?? "\u2014", bVal: b.location ?? "\u2014", compare: "normalize" },
    { label: "Title", aVal: a.current_title ?? "\u2014", bVal: b.current_title ?? "\u2014", compare: "normalize" },
    {
      label: "Experience",
      aVal: a.years_experience != null ? `${a.years_experience} yrs` : "\u2014",
      bVal: b.years_experience != null ? `${b.years_experience} yrs` : "\u2014",
      compare: "exact",
    },
    { label: "LinkedIn", aVal: a.linkedin_url ?? "\u2014", bVal: b.linkedin_url ?? "\u2014", compare: "linkedin" },
    { label: "Source", aVal: a.source, bVal: b.source, compare: "none" },
  ];

  function areEqual(aVal: string, bVal: string, compare: FieldCompare): boolean {
    if (aVal === "\u2014" || bVal === "\u2014") return false;
    switch (compare) {
      case "normalize": return norm(aVal) === norm(bVal);
      case "linkedin": return normLinkedIn(aVal) === normLinkedIn(bVal);
      case "phone": return normPhone(aVal) === normPhone(bVal);
      case "exact": return aVal === bVal;
      case "none": return false; // Source — never highlight
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Score color based on confidence
  const scorePercent = item.composite_score * 100;
  const scoreColor =
    scorePercent >= 85
      ? "text-red-600"
      : scorePercent >= 50
        ? "text-amber-600"
        : "text-muted-foreground";

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
        <ArrowLeft className="size-3.5" /> Back to queue
      </Button>

      {/* Score header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">
            {a.full_name} &harr; {b.full_name}
          </h2>
          <p className={`text-sm font-mono font-bold ${scoreColor}`}>
            {scorePercent.toFixed(1)}% match
          </p>
        </div>
        {!isResolved && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={onDismiss}
            >
              {acting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              Not a Duplicate
            </Button>
            <Button size="sm" disabled={acting} onClick={onMerge}>
              {acting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Merge className="size-3.5" />
              )}
              Merge Candidates
            </Button>
          </div>
        )}
        {isResolved && (
          <Badge
            variant={item.status === "merged" ? "default" : "secondary"}
            className="text-sm"
          >
            {item.status === "merged" ? (
              <CheckCircle2 className="mr-1 size-4" />
            ) : (
              <XCircle className="mr-1 size-4" />
            )}
            {item.status}
          </Badge>
        )}
      </div>

      {/* Score breakdown */}
      {item.score_breakdown &&
        Object.keys(item.score_breakdown).length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.entries(item.score_breakdown).map(([signal, score]) => {
              const val = typeof score === "number" ? score : 0;
              const signalColor =
                val >= 0.8
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                  : val >= 0.5
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                    : "";
              return (
                <Badge
                  key={signal}
                  variant="outline"
                  className={`text-xs ${signalColor}`}
                >
                  {signal}: {typeof score === "number" ? score.toFixed(2) : score}
                </Badge>
              );
            })}
          </div>
        )}

      {/* Side-by-side comparison */}
      <Card>
        <CardHeader>
          <div className="grid grid-cols-[1fr_1fr] gap-4">
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-normal">
                Primary (older)
              </Badge>
              {a.full_name}
            </CardTitle>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-normal">
                Secondary (newer)
              </Badge>
              {b.full_name}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* Field rows */}
          <div className="space-y-0">
            {fields.map(({ label, aVal, bVal, compare }) => {
              const bothPresent = aVal !== "\u2014" && bVal !== "\u2014";
              const match = areEqual(aVal, bVal, compare);
              const conflict = bothPresent && !match && compare !== "none";
              return (
                <div
                  key={label}
                  className={`grid grid-cols-[1fr_1fr] gap-4 border-t py-2 ${
                    conflict
                      ? "bg-destructive/5"
                      : match
                        ? "bg-green-500/5"
                        : ""
                  }`}
                >
                  <div>
                    <span className="text-xs text-muted-foreground">
                      {label}
                      {match && " \u2713"}
                    </span>
                    <p
                      className={`text-sm ${
                        conflict ? "font-medium text-destructive" : ""
                      } ${match ? "text-green-700 dark:text-green-400" : ""}`}
                    >
                      {aVal}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">
                      {label}
                      {match && " \u2713"}
                    </span>
                    <p
                      className={`text-sm ${
                        conflict ? "font-medium text-destructive" : ""
                      } ${match ? "text-green-700 dark:text-green-400" : ""}`}
                    >
                      {bVal}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Skills comparison */}
            <div className="grid grid-cols-[1fr_1fr] gap-4 border-t py-2">
              <div>
                <span className="text-xs text-muted-foreground">Skills</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.skills?.length ? (
                    a.skills.map((s) => {
                      const inB = b.skills?.includes(s);
                      return (
                        <Badge
                          key={s}
                          variant={inB ? "secondary" : "outline"}
                          className={
                            inB
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                              : "border-primary/40 text-primary"
                          }
                        >
                          {s}
                          {inB && " \u2713"}
                        </Badge>
                      );
                    })
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {"\u2014"}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Skills</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {b.skills?.length ? (
                    b.skills.map((s) => {
                      const inA = a.skills?.includes(s);
                      return (
                        <Badge
                          key={s}
                          variant={inA ? "secondary" : "outline"}
                          className={
                            inA
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                              : "border-primary/40 text-primary"
                          }
                        >
                          {s}
                          {inA && " \u2713"}
                        </Badge>
                      );
                    })
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {"\u2014"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
