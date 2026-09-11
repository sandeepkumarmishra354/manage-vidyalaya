import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, type SchoolClass, type Section } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusIcon } from "lucide-react";

const emptyForm = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  classId: "",
  guardianName: "",
  guardianRelation: "father",
  guardianPhone: "",
  guardianEmail: "",
};

export function NewAdmissionDialog({ onCreated }: { onCreated: () => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && selectedBranchId) {
      api.listClasses(selectedBranchId).then(setClasses);
    }
  }, [open, selectedBranchId]);

  useEffect(() => {
    if (form.classId) {
      api.listSections(form.classId).then(setSections);
    } else {
      setSections([]);
    }
  }, [form.classId]);

  const update = (field: keyof typeof emptyForm) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const academicSessionId = await api.currentAcademicSessionId();
      if (!academicSessionId) {
        throw new Error("No active academic session found for this branch.");
      }
      await api.createAdmission({
        branch_id: selectedBranchId,
        academic_session_id: academicSessionId,
        applied_class_id: form.classId || null,
        first_name: form.firstName,
        last_name: form.lastName || null,
        date_of_birth: form.dateOfBirth || null,
        gender: form.gender || null,
        address: form.address || null,
        guardian_name: form.guardianName,
        guardian_relation: form.guardianRelation,
        guardian_phone: form.guardianPhone || null,
        guardian_email: form.guardianEmail || null,
      });
      setForm(emptyForm);
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          New Admission
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Admission</DialogTitle>
          <DialogDescription>
            Works fully offline — this is saved locally right away and syncs to the
            cloud automatically once connectivity is available.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={form.firstName} onChange={update("firstName")} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={form.lastName} onChange={update("lastName")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input id="dob" type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gender">Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Applying for class</Label>
              <Select value={form.classId} onValueChange={(v) => setForm((f) => ({ ...f, classId: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Section (if known)</Label>
              <Select disabled={sections.length === 0}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={sections.length ? "Select section" : "N/A"} />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={form.address} onChange={update("address")} />
          </div>

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium">Primary guardian</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardianName">Full name</Label>
                <Input id="guardianName" value={form.guardianName} onChange={update("guardianName")} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Relation</Label>
                <Select
                  value={form.guardianRelation}
                  onValueChange={(v) => setForm((f) => ({ ...f, guardianRelation: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="father">Father</SelectItem>
                    <SelectItem value="mother">Mother</SelectItem>
                    <SelectItem value="guardian">Guardian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardianPhone">Phone</Label>
                <Input id="guardianPhone" value={form.guardianPhone} onChange={update("guardianPhone")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardianEmail">Email</Label>
                <Input id="guardianEmail" type="email" value={form.guardianEmail} onChange={update("guardianEmail")} />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save admission"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
