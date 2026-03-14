"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { ShortlistResponse } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { List, Plus, Users, ChevronRight } from "lucide-react";

export default function ShortlistsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [shortlists, setShortlists] = useState<ShortlistResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api<ShortlistResponse[]>("/api/shortlists")
      .then(setShortlists)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await api<ShortlistResponse>("/api/shortlists", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null }),
      });
      setShortlists((prev) => [created, ...prev]);
      setDialogOpen(false);
      setName("");
      setDesc("");
      toast.success(`Shortlist "${created.name}" created`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  if (authLoading) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8 glass-mesh">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="size-5 text-primary" />
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Shortlists</h1>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger render={<Button size="sm" />}>
                <Plus className="size-3.5" /> New Shortlist
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Shortlist</DialogTitle>
                  <DialogDescription>
                    Give your shortlist a name and optional description.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="flex flex-col gap-3 mt-2">
                  <Input
                    placeholder="Shortlist name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                  <Button type="submit" disabled={creating || !name.trim()}>
                    {creating ? "Creating..." : "Create"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : shortlists.length === 0 ? (
            <div className="py-16 text-center">
              <List className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No shortlists yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shortlists.map((sl) => (
                <Card
                  key={sl.id}
                  className="cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/20"
                  onClick={() => router.push(`/shortlists/${sl.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{sl.name}</CardTitle>
                        {sl.description && (
                          <CardDescription className="mt-0.5">
                            {sl.description}
                          </CardDescription>
                        )}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="size-3.5" />
                      <span>{sl.candidate_count} candidate{sl.candidate_count !== 1 ? "s" : ""}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
