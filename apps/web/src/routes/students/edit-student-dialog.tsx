import { useEffect, useState } from "react";
import { PencilIcon } from "lucide-react";

import { api, type SchoolClass, type Section, type StudentDetail, type StudentStatus } from "@/lib/api";
import { MasterDataSelect } from "@/components/master-data-select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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

  const update = (field: keyof StudentDetail) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
        roll_number: form.roll_number,
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        blood_group: form.blood_group,
        current_class_id: form.current_class_id,
        current_section_id: form.current_section_id,
        status: form.status,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        notes: form.notes,
        category: form.category,
        religion: form.religion,
        nationality: form.nationality,
        mother_tongue: form.mother_tongue,
        aadhaar_number: form.aadhaar_number,
        previous_school_name: form.previous_school_name,
        medical_notes: form.medical_notes,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        graduation_year: form.graduation_year,
        higher_education: form.higher_education,
        current_occupation: form.current_occupation,
        alumni_contact_email: form.alumni_contact_email,
        alumni_notes: form.alumni_notes,
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="address">Address</TabsTrigger>
              <TabsTrigger value="additional">Additional Details</TabsTrigger>
              {form.status === "alumni" && <TabsTrigger value="alumni">Alumni</TabsTrigger>}
            </TabsList>

            <TabsContent value="basic" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-firstName">First name</Label>
                <Input id="edit-firstName" value={form.first_name} onChange={update("first_name")} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-lastName">Last name</Label>
                <Input id="edit-lastName" value={form.last_name ?? ""} onChange={update("last_name")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-rollNumber">Roll number</Label>
                <Input id="edit-rollNumber" value={form.roll_number ?? ""} onChange={update("roll_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-dob">Date of birth</Label>
                <Input id="edit-dob" type="date" value={form.date_of_birth ?? ""} onChange={update("date_of_birth")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Gender</Label>
                <MasterDataSelect
                  type="gender"
                  value={form.gender ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, gender: v }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Blood group</Label>
                <MasterDataSelect
                  type="blood_group"
                  value={form.blood_group ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, blood_group: v }))}
                />
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
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as StudentStatus }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enquiry">Enquiry</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                    <SelectItem value="withdrawn">Withdrawn / not continuing</SelectItem>
                    <SelectItem value="alumni">Alumni</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="address" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-address">Address</Label>
                <Input id="edit-address" value={form.address ?? ""} onChange={update("address")} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-city">City</Label>
                  <Input id="edit-city" value={form.city ?? ""} onChange={update("city")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-state">State</Label>
                  <Input id="edit-state" value={form.state ?? ""} onChange={update("state")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-pincode">Pincode</Label>
                  <Input id="edit-pincode" value={form.pincode ?? ""} onChange={update("pincode")} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="additional" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <MasterDataSelect
                  type="student_category"
                  value={form.category ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Religion</Label>
                <MasterDataSelect
                  type="religion"
                  value={form.religion ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, religion: v }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Nationality</Label>
                <MasterDataSelect
                  type="nationality"
                  value={form.nationality ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, nationality: v }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Mother tongue</Label>
                <MasterDataSelect
                  type="mother_tongue"
                  value={form.mother_tongue ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, mother_tongue: v }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-aadhaarNumber">Aadhaar number</Label>
                <Input id="edit-aadhaarNumber" value={form.aadhaar_number ?? ""} onChange={update("aadhaar_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-previousSchoolName">Previous school</Label>
                <Input id="edit-previousSchoolName" value={form.previous_school_name ?? ""} onChange={update("previous_school_name")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-emergencyContactName">Emergency contact name</Label>
                <Input id="edit-emergencyContactName" value={form.emergency_contact_name ?? ""} onChange={update("emergency_contact_name")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-emergencyContactPhone">Emergency contact phone</Label>
                <Input id="edit-emergencyContactPhone" value={form.emergency_contact_phone ?? ""} onChange={update("emergency_contact_phone")} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="edit-medicalNotes">Medical notes (allergies, conditions)</Label>
                <Textarea id="edit-medicalNotes" value={form.medical_notes ?? ""} onChange={update("medical_notes")} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea id="edit-notes" value={form.notes ?? ""} onChange={update("notes")} />
              </div>
            </TabsContent>

            {form.status === "alumni" && (
              <TabsContent value="alumni" className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-graduationYear">Graduation year</Label>
                  <Input
                    id="edit-graduationYear"
                    type="number"
                    value={form.graduation_year ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, graduation_year: e.target.value ? Number(e.target.value) : null }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-higherEducation">Higher education</Label>
                  <Input id="edit-higherEducation" value={form.higher_education ?? ""} onChange={update("higher_education")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-currentOccupation">Current occupation</Label>
                  <Input id="edit-currentOccupation" value={form.current_occupation ?? ""} onChange={update("current_occupation")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-alumniContactEmail">Contact email</Label>
                  <Input id="edit-alumniContactEmail" type="email" value={form.alumni_contact_email ?? ""} onChange={update("alumni_contact_email")} />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="edit-alumniNotes">Notes</Label>
                  <Textarea id="edit-alumniNotes" value={form.alumni_notes ?? ""} onChange={update("alumni_notes")} />
                </div>
              </TabsContent>
            )}
          </Tabs>

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
