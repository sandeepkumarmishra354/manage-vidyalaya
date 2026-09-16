import { useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { emptyGuardianPickerValue, GuardianPicker, type GuardianPickerValue } from "./guardian-picker";

const emptyForm = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  classId: "",
  guardianRelation: "father",
  category: "",
  religion: "",
  nationality: "",
  motherTongue: "",
  aadhaarNumber: "",
  previousSchoolName: "",
  medicalNotes: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

export function NewAdmissionDialog({ onCreated }: { onCreated: () => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [guardian, setGuardian] = useState<GuardianPickerValue>(emptyGuardianPickerValue);
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
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
        category: form.category || null,
        religion: form.religion || null,
        nationality: form.nationality || null,
        mother_tongue: form.motherTongue || null,
        aadhaar_number: form.aadhaarNumber || null,
        previous_school_name: form.previousSchoolName || null,
        medical_notes: form.medicalNotes || null,
        emergency_contact_name: form.emergencyContactName || null,
        emergency_contact_phone: form.emergencyContactPhone || null,
        guardian_id: guardian.mode === "existing" ? guardian.guardianId : null,
        guardian_name: guardian.mode === "new" ? guardian.fullName : undefined,
        guardian_relation: form.guardianRelation,
        guardian_phone: guardian.mode === "new" ? guardian.phone || null : null,
        guardian_alt_phone: guardian.mode === "new" ? guardian.altPhone || null : null,
        guardian_email: guardian.mode === "new" ? guardian.email || null : null,
        guardian_occupation: guardian.mode === "new" ? guardian.occupation || null : null,
        guardian_address: guardian.mode === "new" ? guardian.address || null : null,
        guardian_aadhaar_number: guardian.mode === "new" ? guardian.aadhaarNumber || null : null,
        guardian_annual_income:
          guardian.mode === "new" && guardian.annualIncome ? Number(guardian.annualIncome) : null,
      });
      setForm(emptyForm);
      setGuardian(emptyGuardianPickerValue);
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Admission</DialogTitle>
          <DialogDescription>Enter the applicant's and guardian's details to start an admission.</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="address">Address</TabsTrigger>
              <TabsTrigger value="guardian">Guardian</TabsTrigger>
              <TabsTrigger value="additional">Additional Details</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="grid grid-cols-2 gap-4">
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
            </TabsContent>

            <TabsContent value="address">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={update("address")} />
              </div>
            </TabsContent>

            <TabsContent value="guardian">
              <div className="mb-3 flex flex-col gap-1.5">
                <Label>Relation to student</Label>
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
              <GuardianPicker value={guardian} onChange={setGuardian} />
            </TabsContent>

            <TabsContent value="additional" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="OBC">OBC</SelectItem>
                    <SelectItem value="SC">SC</SelectItem>
                    <SelectItem value="ST">ST</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="religion">Religion</Label>
                <Input id="religion" value={form.religion} onChange={update("religion")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nationality">Nationality</Label>
                <Input id="nationality" placeholder="e.g. Indian" value={form.nationality} onChange={update("nationality")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="motherTongue">Mother tongue</Label>
                <Input id="motherTongue" value={form.motherTongue} onChange={update("motherTongue")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aadhaarNumber">Aadhaar number</Label>
                <Input id="aadhaarNumber" value={form.aadhaarNumber} onChange={update("aadhaarNumber")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="previousSchoolName">Previous school</Label>
                <Input id="previousSchoolName" value={form.previousSchoolName} onChange={update("previousSchoolName")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emergencyContactName">Emergency contact name</Label>
                <Input id="emergencyContactName" value={form.emergencyContactName} onChange={update("emergencyContactName")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emergencyContactPhone">Emergency contact phone</Label>
                <Input id="emergencyContactPhone" value={form.emergencyContactPhone} onChange={update("emergencyContactPhone")} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="medicalNotes">Medical notes (allergies, conditions)</Label>
                <Textarea id="medicalNotes" value={form.medicalNotes} onChange={update("medicalNotes")} />
              </div>
            </TabsContent>
          </Tabs>

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
