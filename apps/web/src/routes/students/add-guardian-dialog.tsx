import { useState } from "react";
import { UserPlusIcon } from "lucide-react";

import { api } from "@/lib/api";
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
import { Label } from "@/components/ui/label";
import { emptyGuardianPickerValue, GuardianPicker, type GuardianPickerValue } from "./guardian-picker";

export function AddGuardianDialog({ studentId, onAdded }: { studentId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [guardian, setGuardian] = useState<GuardianPickerValue>(emptyGuardianPickerValue);
  const [relation, setRelation] = useState("Guardian");
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setGuardian(emptyGuardianPickerValue);
    setRelation("Guardian");
    setIsPrimaryContact(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.addGuardianToStudent(studentId, {
        guardian_id: guardian.mode === "existing" ? guardian.guardianId : null,
        relation,
        is_primary_contact: isPrimaryContact,
        full_name: guardian.mode === "new" ? guardian.fullName : undefined,
        phone: guardian.mode === "new" ? guardian.phone || null : null,
        alt_phone: guardian.mode === "new" ? guardian.altPhone || null : null,
        email: guardian.mode === "new" ? guardian.email || null : null,
        occupation: guardian.mode === "new" ? guardian.occupation || null : null,
        address: guardian.mode === "new" ? guardian.address || null : null,
        aadhaar_number: guardian.mode === "new" ? guardian.aadhaarNumber || null : null,
        annual_income: guardian.mode === "new" && guardian.annualIncome ? Number(guardian.annualIncome) : null,
      });
      reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlusIcon className="size-3.5" />
          Add guardian
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add guardian</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Relation to student</Label>
            <MasterDataSelect type="guardian_relation" value={relation} onChange={setRelation} />
          </div>

          <GuardianPicker value={guardian} onChange={setGuardian} />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimaryContact}
              onChange={(e) => setIsPrimaryContact(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Set as primary contact
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Add guardian"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
