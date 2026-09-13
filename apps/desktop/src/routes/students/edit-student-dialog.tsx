import { useEffect, useState } from "react";
import { PencilIcon } from "lucide-react";

import { api, type SchoolClass, type Section, type StudentDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EditStudentDialog({
  student,
  branchId,
  onUpdated,
}: {
  student: StudentDetail;
  branchId: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [form, setForm] = useState(student);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(student);
      api.listClasses(branchId).then(setClasses);
    }
  }, [open, student, branchId]);

  useEffect(() => {
    if (form.current_class_id) api.listSections(form.current_class_id).then(setSections);
    else setSections([]);
  }, [form.current_class_id]);

  const update = (field: keyof StudentDetail) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.updateStudent({
        id: student.id,
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        blood_group: null,
        current_class_id: form.current_class_id,
        current_section_id: form.current_section_id,
        address: form.address,
        city: null,
        state: null,
        pincode: null,
        notes: null,
      });
      setOpen(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-firstName">First name</Label>
              <Input id="edit-firstName" value={form.first_name} onChange={update("first_name")} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lastName">Last name</Label>
              <Input id="edit-lastName" value={form.last_name ?? ""} onChange={update("last_name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-dob">Date of birth</Label>
              <Input id="edit-dob" type="date" value={form.date_of_birth ?? ""} onChange={update("date_of_birth")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-gender">Gender</Label>
              <Input id="edit-gender" value={form.gender ?? ""} onChange={update("gender")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Class</Label>
              <Select value={form.current_class_id ?? undefined} onValueChange={(v) => setForm((f) => ({ ...f, current_class_id: v, current_section_id: null }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Section</Label>
              <Select value={form.current_section_id ?? undefined} onValueChange={(v) => setForm((f) => ({ ...f, current_section_id: v }))} disabled={sections.length === 0}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-address">Address</Label>
            <Input id="edit-address" value={form.address ?? ""} onChange={update("address")} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
