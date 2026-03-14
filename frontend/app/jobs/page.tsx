"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import type { JobResponse } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Briefcase, Plus, MapPin, DollarSign, Clock } from "lucide-react";
import { toast } from "sonner";

export default function JobsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [experienceRequired, setExperienceRequired] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [skillsRequired, setSkillsRequired] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    fetchJobs();
  }, [user, authLoading, router]);

  async function fetchJobs() {
    try {
      const data = await api<JobResponse[]>("/api/jobs");
      setJobs(data);
    } catch { }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setCreating(true);
    try {
      const body = {
        title: title.trim(),
        company: company.trim() || null,
        department: department.trim() || null,
        location: location.trim() || null,
        employment_type: employmentType,
        experience_required: experienceRequired ? parseFloat(experienceRequired) : null,
        salary_min: salaryMin ? parseFloat(salaryMin) : null,
        salary_max: salaryMax ? parseFloat(salaryMax) : null,
        skills_required: skillsRequired ? skillsRequired.split(",").map(s => s.trim()).filter(Boolean) : [],
        job_description: jobDescription.trim() || null,
      };
      await api<JobResponse>("/api/jobs", { method: "POST", body: JSON.stringify(body) });
      toast.success("Job created");
      setOpen(false);
      resetForm();
      fetchJobs();
    } catch (e: any) {
      toast.error(e.message || "Failed to create job");
    } finally { setCreating(false); }
  }

  function resetForm() {
    setTitle(""); setCompany(""); setDepartment(""); setLocation("");
    setEmploymentType("full_time"); setExperienceRequired(""); setSalaryMin("");
    setSalaryMax(""); setSkillsRequired(""); setJobDescription("");
  }

  if (authLoading) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-[220px]">
        <Topbar />
        <main className="flex-1 p-8">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="size-5 text-primary" />
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Job Openings</h1>
              <Badge variant="secondary">{jobs.length}</Badge>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm" />}>
                <Plus className="mr-1 size-4" />New Job
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Job Opening</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <Input placeholder="Job Title *" value={title} onChange={e => setTitle(e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Company" value={company} onChange={e => setCompany(e.target.value)} />
                    <Input placeholder="Department" value={department} onChange={e => setDepartment(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} />
                    <select className="rounded-md border px-3 py-2 text-sm" value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
                      <option value="full_time">Full Time</option>
                      <option value="part_time">Part Time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Input placeholder="Exp (years)" type="number" value={experienceRequired} onChange={e => setExperienceRequired(e.target.value)} />
                    <Input placeholder="Salary Min" type="number" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} />
                    <Input placeholder="Salary Max" type="number" value={salaryMax} onChange={e => setSalaryMax(e.target.value)} />
                  </div>
                  <Input placeholder="Skills (comma-separated)" value={skillsRequired} onChange={e => setSkillsRequired(e.target.value)} />
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm min-h-[100px]"
                    placeholder="Job Description"
                    value={jobDescription}
                    onChange={e => setJobDescription(e.target.value)}
                  />
                  <Button className="w-full" onClick={handleCreate} disabled={creating}>
                    {creating ? "Creating..." : "Create Job"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : jobs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No job openings yet. Create one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {jobs.map(job => (
                <Card
                  key={job.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/jobs/${job.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{job.title}</CardTitle>
                      <Badge variant={job.status === "open" ? "default" : "secondary"}>
                        {job.status}
                      </Badge>
                    </div>
                    {job.company && (
                      <CardDescription>{job.company}{job.department ? ` · ${job.department}` : ""}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {job.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="size-3.5" />{job.location}
                      </div>
                    )}
                    {job.experience_required != null && (
                      <div className="flex items-center gap-1">
                        <Clock className="size-3.5" />{job.experience_required}+ years
                      </div>
                    )}
                    {(job.salary_min || job.salary_max) && (
                      <div className="flex items-center gap-1">
                        <DollarSign className="size-3.5" />
                        {job.salary_min ? `$${(job.salary_min / 1000).toFixed(0)}k` : ""}
                        {job.salary_min && job.salary_max ? " - " : ""}
                        {job.salary_max ? `$${(job.salary_max / 1000).toFixed(0)}k` : ""}
                      </div>
                    )}
                    {job.skills_required && job.skills_required.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {job.skills_required.slice(0, 5).map(s => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                        {job.skills_required.length > 5 && (
                          <Badge variant="outline" className="text-xs">+{job.skills_required.length - 5}</Badge>
                        )}
                      </div>
                    )}
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
