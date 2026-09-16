import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type NewStaffInput } from "@/lib/api";
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
import { StaffCategorySelect } from "./staff-category-select";

const emptyForm = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  designation: "",
  categoryId: "",
  department: "",
  employmentType: "full_time",
  dateOfJoining: new Date().toISOString().slice(0, 10),
  phone: "",
  personalEmail: "",
  dateOfBirth: "",
  gender: "",
  bloodGroup: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  qualification: "",
  panNumber: "",
  aadhaarNumber: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
  pfNumber: "",
  esiNumber: "",
  uanNumber: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

export function NewStaffDialog({ onCreated }: { onCreated: () => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof emptyForm) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const input: NewStaffInput = {
        branch_id: selectedBranchId,
        employee_code: form.employeeCode,
        first_name: form.firstName,
        last_name: form.lastName || null,
        designation: form.designation,
        category_id: form.categoryId || null,
        department: form.department || null,
        employment_type: form.employmentType as NewStaffInput["employment_type"],
        date_of_joining: form.dateOfJoining,
        phone: form.phone || null,
        personal_email: form.personalEmail || null,
        date_of_birth: form.dateOfBirth || null,
        gender: form.gender || null,
        blood_group: form.bloodGroup || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        qualification: form.qualification || null,
        pan_number: form.panNumber || null,
        aadhaar_number: form.aadhaarNumber || null,
        bank_account_number: form.bankAccountNumber || null,
        bank_ifsc: form.bankIfsc || null,
        bank_name: form.bankName || null,
        pf_number: form.pfNumber || null,
        esi_number: form.esiNumber || null,
        uan_number: form.uanNumber || null,
        emergency_contact_name: form.emergencyContactName || null,
        emergency_contact_phone: form.emergencyContactPhone || null,
        notes: null,
      };
      await api.createStaff(input);
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
          New Staff
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New staff member</DialogTitle>
          <DialogDescription>
            Only name, employee code, designation, employment type, and joining date are required --
            everything else can be filled in later.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              <TabsTrigger value="statutory">Statutory &amp; Bank</TabsTrigger>
              <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
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
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gender">Gender</Label>
                <Input id="gender" value={form.gender} onChange={update("gender")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bloodGroup">Blood group</Label>
                <Input id="bloodGroup" value={form.bloodGroup} onChange={update("bloodGroup")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qualification">Qualification</Label>
                <Input id="qualification" value={form.qualification} onChange={update("qualification")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={update("phone")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="personalEmail">Personal email</Label>
                <Input id="personalEmail" type="email" value={form.personalEmail} onChange={update("personalEmail")} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={update("address")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={update("city")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={form.state} onChange={update("state")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pincode">Pincode</Label>
                <Input id="pincode" value={form.pincode} onChange={update("pincode")} />
              </div>
            </TabsContent>

            <TabsContent value="employment" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="employeeCode">Employee code</Label>
                <Input id="employeeCode" value={form.employeeCode} onChange={update("employeeCode")} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  placeholder="e.g. PGT Mathematics"
                  value={form.designation}
                  onChange={update("designation")}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <StaffCategorySelect value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={form.department} onChange={update("department")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Employment type</Label>
                <Select
                  value={form.employmentType}
                  onValueChange={(v) => setForm((f) => ({ ...f, employmentType: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dateOfJoining">Date of joining</Label>
                <Input
                  id="dateOfJoining"
                  type="date"
                  value={form.dateOfJoining}
                  onChange={update("dateOfJoining")}
                  required
                />
              </div>
            </TabsContent>

            <TabsContent value="statutory" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="panNumber">PAN</Label>
                <Input id="panNumber" value={form.panNumber} onChange={update("panNumber")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aadhaarNumber">Aadhaar</Label>
                <Input id="aadhaarNumber" value={form.aadhaarNumber} onChange={update("aadhaarNumber")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pfNumber">PF number</Label>
                <Input id="pfNumber" value={form.pfNumber} onChange={update("pfNumber")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="esiNumber">ESI number</Label>
                <Input id="esiNumber" value={form.esiNumber} onChange={update("esiNumber")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="uanNumber">UAN</Label>
                <Input id="uanNumber" value={form.uanNumber} onChange={update("uanNumber")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bankName">Bank name</Label>
                <Input id="bankName" value={form.bankName} onChange={update("bankName")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bankAccountNumber">Bank account #</Label>
                <Input id="bankAccountNumber" value={form.bankAccountNumber} onChange={update("bankAccountNumber")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bankIfsc">IFSC</Label>
                <Input id="bankIfsc" value={form.bankIfsc} onChange={update("bankIfsc")} />
              </div>
            </TabsContent>

            <TabsContent value="emergency" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emergencyContactName">Name</Label>
                <Input id="emergencyContactName" value={form.emergencyContactName} onChange={update("emergencyContactName")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emergencyContactPhone">Phone</Label>
                <Input id="emergencyContactPhone" value={form.emergencyContactPhone} onChange={update("emergencyContactPhone")} />
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save staff member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
