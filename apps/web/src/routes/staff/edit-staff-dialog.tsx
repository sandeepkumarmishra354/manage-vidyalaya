import { useEffect, useState } from "react";
import { PencilIcon } from "lucide-react";

import { api, type Staff } from "@/lib/api";
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
import { StaffCategorySelect } from "./staff-category-select";

export function EditStaffDialog({ staff, onUpdated }: { staff: Staff; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(staff);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm(staff);
  }, [open, staff]);

  const update = (field: keyof Staff) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.updateStaff({
        id: staff.id,
        branch_id: form.branch_id,
        employee_code: form.employee_code,
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        phone: form.phone,
        personal_email: form.personal_email,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        designation: form.designation,
        category_id: form.category_id,
        department: form.department,
        employment_type: form.employment_type,
        date_of_joining: form.date_of_joining,
        qualification: form.qualification,
        blood_group: form.blood_group,
        pan_number: form.pan_number,
        aadhaar_number: form.aadhaar_number,
        bank_account_number: form.bank_account_number,
        bank_ifsc: form.bank_ifsc,
        bank_name: form.bank_name,
        pf_number: form.pf_number,
        esi_number: form.esi_number,
        uan_number: form.uan_number,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        notes: form.notes,
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
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit staff member</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
              <TabsTrigger value="statutory">Statutory &amp; Bank</TabsTrigger>
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
                <Label htmlFor="edit-dob">Date of birth</Label>
                <Input id="edit-dob" type="date" value={form.date_of_birth ?? ""} onChange={update("date_of_birth")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-gender">Gender</Label>
                <Input id="edit-gender" value={form.gender ?? ""} onChange={update("gender")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-bloodGroup">Blood group</Label>
                <Input id="edit-bloodGroup" value={form.blood_group ?? ""} onChange={update("blood_group")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-qualification">Qualification</Label>
                <Input id="edit-qualification" value={form.qualification ?? ""} onChange={update("qualification")} />
              </div>
            </TabsContent>

            <TabsContent value="employment" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-employeeCode">Employee code</Label>
                <Input id="edit-employeeCode" value={form.employee_code} onChange={update("employee_code")} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-designation">Designation</Label>
                <Input id="edit-designation" value={form.designation} onChange={update("designation")} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <StaffCategorySelect
                  value={form.category_id ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-department">Department</Label>
                <Input id="edit-department" value={form.department ?? ""} onChange={update("department")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Employment type</Label>
                <Select
                  value={form.employment_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, employment_type: v as Staff["employment_type"] }))}
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
                <Label htmlFor="edit-dateOfJoining">Date of joining</Label>
                <Input id="edit-dateOfJoining" type="date" value={form.date_of_joining} onChange={update("date_of_joining")} required />
              </div>
            </TabsContent>

            <TabsContent value="contact" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input id="edit-phone" value={form.phone ?? ""} onChange={update("phone")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-personalEmail">Personal email</Label>
                <Input id="edit-personalEmail" value={form.personal_email ?? ""} onChange={update("personal_email")} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="edit-address">Address</Label>
                <Input id="edit-address" value={form.address ?? ""} onChange={update("address")} />
              </div>
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-emergencyContactName">Emergency contact name</Label>
                <Input id="edit-emergencyContactName" value={form.emergency_contact_name ?? ""} onChange={update("emergency_contact_name")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-emergencyContactPhone">Emergency contact phone</Label>
                <Input id="edit-emergencyContactPhone" value={form.emergency_contact_phone ?? ""} onChange={update("emergency_contact_phone")} />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea id="edit-notes" value={form.notes ?? ""} onChange={update("notes")} />
              </div>
            </TabsContent>

            <TabsContent value="statutory" className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-panNumber">PAN</Label>
                <Input id="edit-panNumber" value={form.pan_number ?? ""} onChange={update("pan_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-aadhaarNumber">Aadhaar</Label>
                <Input id="edit-aadhaarNumber" value={form.aadhaar_number ?? ""} onChange={update("aadhaar_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-pfNumber">PF number</Label>
                <Input id="edit-pfNumber" value={form.pf_number ?? ""} onChange={update("pf_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-esiNumber">ESI number</Label>
                <Input id="edit-esiNumber" value={form.esi_number ?? ""} onChange={update("esi_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-uanNumber">UAN</Label>
                <Input id="edit-uanNumber" value={form.uan_number ?? ""} onChange={update("uan_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-bankName">Bank name</Label>
                <Input id="edit-bankName" value={form.bank_name ?? ""} onChange={update("bank_name")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-bankAccountNumber">Bank account #</Label>
                <Input id="edit-bankAccountNumber" value={form.bank_account_number ?? ""} onChange={update("bank_account_number")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-bankIfsc">IFSC</Label>
                <Input id="edit-bankIfsc" value={form.bank_ifsc ?? ""} onChange={update("bank_ifsc")} />
              </div>
            </TabsContent>
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
