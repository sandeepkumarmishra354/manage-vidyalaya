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
import { StaffCategorySelect } from "./staff-category-select";

export function EditStaffDialog({ staff, onUpdated }: { staff: Staff; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(staff);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm(staff);
  }, [open, staff]);

  const update = (field: keyof Staff) => (e: React.ChangeEvent<HTMLInputElement>) =>
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
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit staff member</DialogTitle>
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
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={form.phone ?? ""} onChange={update("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-personalEmail">Personal email</Label>
              <Input id="edit-personalEmail" value={form.personal_email ?? ""} onChange={update("personal_email")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-bankAccountNumber">Bank account #</Label>
              <Input id="edit-bankAccountNumber" value={form.bank_account_number ?? ""} onChange={update("bank_account_number")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-bankIfsc">IFSC</Label>
              <Input id="edit-bankIfsc" value={form.bank_ifsc ?? ""} onChange={update("bank_ifsc")} />
            </div>
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
