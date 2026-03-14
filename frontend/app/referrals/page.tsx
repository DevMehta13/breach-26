"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type {
  JobResponse, EmployeeResponse, ReferralResponse, ReferralListResponse,
} from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus, Plus, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  referred: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  interview: "bg-[#8B6B99]/10 text-[#8B6B99]",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function ReferralsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [referrals, setReferrals] = useState<ReferralResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form
  const [empId, setEmpId] = useState("");
  const [jobId, setJobId] = useState("");
  const [candName, setCandName] = useState("");
  const [candEmail, setCandEmail] = useState("");
  const [candPhone, setCandPhone] = useState("");
  const [candLocation, setCandLocation] = useState("");
  const [candTitle, setCandTitle] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    Promise.all([
      api<ReferralListResponse>("/api/referrals"),
      api<EmployeeResponse[]>("/api/employees"),
      api<JobResponse[]>("/api/jobs"),
    ]).then(([r, e, j]) => {
      setReferrals(r.results);
      setEmployees(e);
      setJobs(j);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user, authLoading, router]);

  async function handleCreate() {
    if (!empId || !jobId || !candName || !candEmail) {
      toast.error("Employee, Job, Candidate Name & Email are required");
      return;
    }
    setCreating(true);
    try {
      await api("/api/referrals", {
        method: "POST",
        body: JSON.stringify({
          employee_id: empId,
          job_id: jobId,
          candidate_name: candName,
          candidate_email: candEmail,
          candidate_phone: candPhone || null,
          candidate_location: candLocation || null,
          candidate_title: candTitle || null,
          notes: notes || null,
        }),
      });
      toast.success("Referral created");
      setOpen(false);
      // Refresh
      const r = await api<ReferralListResponse>("/api/referrals");
      setReferrals(r.results);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setCreating(false); }
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
              <UserPlus className="size-5 text-primary" />
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Employee Referrals</h1>
              <Badge variant="secondary">{referrals.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push("/referrals/analytics")}>
                <BarChart3 className="mr-1 size-4" />Analytics
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="mr-1 size-4" />New Referral
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Create Referral</DialogTitle></DialogHeader>
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Referring Employee *</label>
                      <select className="w-full rounded-md border px-3 py-2 text-sm" value={empId} onChange={e => setEmpId(e.target.value)}>
                        <option value="">-- Select Employee --</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.email})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Job Opening *</label>
                      <select className="w-full rounded-md border px-3 py-2 text-sm" value={jobId} onChange={e => setJobId(e.target.value)}>
                        <option value="">-- Select Job --</option>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                      </select>
                    </div>
                    <Input placeholder="Candidate Name *" value={candName} onChange={e => setCandName(e.target.value)} />
                    <Input placeholder="Candidate Email *" type="email" value={candEmail} onChange={e => setCandEmail(e.target.value)} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Phone" value={candPhone} onChange={e => setCandPhone(e.target.value)} />
                      <Input placeholder="Location" value={candLocation} onChange={e => setCandLocation(e.target.value)} />
                    </div>
                    <Input placeholder="Current Title" value={candTitle} onChange={e => setCandTitle(e.target.value)} />
                    <textarea className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]" placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
                    <Button className="w-full" onClick={handleCreate} disabled={creating}>
                      {creating ? "Creating..." : "Submit Referral"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {loading ? <Skeleton className="h-64 w-full" /> : referrals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No referrals yet. Create employees and jobs first, then submit referrals.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 px-3 text-left font-medium">Employee</th>
                        <th className="py-2 px-3 text-left font-medium">Candidate</th>
                        <th className="py-2 px-3 text-left font-medium">Job</th>
                        <th className="py-2 px-3 text-center font-medium">Status</th>
                        <th className="py-2 px-3 text-left font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((r, i) => (
                        <tr key={r.id} className={i % 2 ? "bg-muted/30" : ""}>
                          <td className="py-2 px-3 font-medium">{r.employee_name || "-"}</td>
                          <td className="py-2 px-3">{r.candidate_name || "-"}</td>
                          <td className="py-2 px-3 text-muted-foreground">{r.job_title || "-"}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-700"}`}>
                              {r.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">
                            {new Date(r.referred_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
