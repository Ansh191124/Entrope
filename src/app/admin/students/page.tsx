"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Upload, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { apiFetch, ApiError } from "@/lib/api";

interface Student {
  id: string;
  enrollmentNo: string;
  name: string;
  email: string;
  department: string;
  course: string;
  year: number;
  active: boolean;
  presence?: { status: string } | null;
}

interface StudentsResponse {
  success: true;
  items: Student[];
  total: number;
}

interface ImportSummary {
  totalRows: number;
  imported: number;
  rejected: number;
  results: Array<{ row: number; enrollmentNo?: string; status: string; errors?: string[] }>;
}

function CreateStudentForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    enrollmentNo: "",
    name: "",
    email: "",
    department: "",
    course: "",
    year: 1,
    semester: 1,
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ success: true; generatedPassword?: string }>("/api/students", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast({
        title: "Student created",
        description: res.generatedPassword ? `Temporary password: ${res.generatedPassword}` : undefined,
        variant: "success",
      });
      setForm({ enrollmentNo: "", name: "", email: "", department: "", course: "", year: 1, semester: 1 });
      onCreated();
    } catch (err) {
      toast({ title: "Could not create student", description: err instanceof ApiError ? err.message : undefined, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="enrollmentNo">Enrollment No.</Label>
        <Input id="enrollmentNo" required value={form.enrollmentNo} onChange={(e) => setForm({ ...form, enrollmentNo: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="department">Department</Label>
        <Input id="department" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="course">Course</Label>
        <Input id="course" required value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
      </div>
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor="year">Year</Label>
          <Input id="year" type="number" min={1} max={10} required value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="semester">Semester</Label>
          <Input id="semester" type="number" min={1} max={20} required value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={submitting}>
          <UserPlus className="mr-2 h-4 w-4" /> {submitting ? "Creating…" : "Create Student"}
        </Button>
      </div>
    </form>
  );
}

function CsvImportControl({ onImported }: { onImported: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/students/import", { method: "POST", body: formData, credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body.error, body.message);
      setSummary(body.summary);
      toast({
        title: "Import complete",
        description: `${body.summary.imported} imported, ${body.summary.rejected} rejected`,
        variant: body.summary.rejected > 0 ? "warning" : "success",
      });
      onImported();
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof ApiError ? err.message : undefined, variant: "error" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
        <Upload className="mr-2 h-4 w-4" /> {importing ? "Importing…" : "Import CSV"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Columns: enrollmentNo, name, email, department, course, year, semester, phone (optional), section (optional).
        Every row is validated — bad rows are reported, never silently imported.
      </p>
      {summary && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">
            {summary.imported} imported, {summary.rejected} rejected out of {summary.totalRows} rows
          </p>
          {summary.rejected > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-destructive">
              {summary.results
                .filter((r) => r.status === "rejected")
                .map((r) => (
                  <li key={r.row}>
                    Row {r.row} ({r.enrollmentNo ?? "?"}): {r.errors?.join("; ")}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminStudentsPage() {
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["students", q],
    queryFn: () => apiFetch<StudentsResponse>(`/api/students?q=${encodeURIComponent(q)}&pageSize=50`),
  });
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["students"] });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Students</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Student</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateStudentForm onCreated={refresh} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bulk Import</CardTitle>
          </CardHeader>
          <CardContent>
            <CsvImportControl onImported={refresh} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>All Students ({query.data?.total ?? 0})</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, enrollment, email…" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Enrollment</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Course / Year</th>
                  <th className="py-2 pr-4">Presence</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4">{s.enrollmentNo}</td>
                    <td className="py-2 pr-4">{s.name}</td>
                    <td className="py-2 pr-4">{s.department}</td>
                    <td className="py-2 pr-4">
                      {s.course} / Y{s.year}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={s.presence?.status === "INSIDE" ? "success" : "secondary"}>
                        {s.presence?.status ?? "OUTSIDE"}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant={s.active ? "outline" : "destructive"}>{s.active ? "Active" : "Disabled"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
