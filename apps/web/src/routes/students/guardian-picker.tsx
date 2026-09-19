import { useEffect, useState } from "react";
import { SearchIcon, UserPlusIcon } from "lucide-react";

import { api, type GuardianSearchResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonLink } from "@/components/person-link";

export interface GuardianPickerValue {
  mode: "existing" | "new";
  guardianId: string | null;
  fullName: string;
  phone: string;
  altPhone: string;
  email: string;
  occupation: string;
  address: string;
  aadhaarNumber: string;
  annualIncome: string;
}

export const emptyGuardianPickerValue: GuardianPickerValue = {
  mode: "new",
  guardianId: null,
  fullName: "",
  phone: "",
  altPhone: "",
  email: "",
  occupation: "",
  address: "",
  aadhaarNumber: "",
  annualIncome: "",
};

/**
 * Search-or-create control for linking a guardian to a student. Selecting
 * an existing guardian (rather than creating a new one) is how two
 * students end up sharing a guardian, i.e. how siblings get related.
 */
export function GuardianPicker({
  value,
  onChange,
}: {
  value: GuardianPickerValue;
  onChange: (value: GuardianPickerValue) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<GuardianSearchResult[]>([]);
  const [selected, setSelected] = useState<GuardianSearchResult | null>(null);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      api.searchGuardians(search).then(setResults);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const selectExisting = (guardian: GuardianSearchResult) => {
    setSelected(guardian);
    setResults([]);
    setSearch("");
    onChange({
      mode: "existing",
      guardianId: guardian.id,
      fullName: guardian.full_name,
      phone: guardian.phone ?? "",
      altPhone: guardian.alt_phone ?? "",
      email: guardian.email ?? "",
      occupation: guardian.occupation ?? "",
      address: guardian.address ?? "",
      aadhaarNumber: guardian.aadhaar_number ?? "",
      annualIncome: guardian.annual_income != null ? String(guardian.annual_income) : "",
    });
  };

  const startNew = () => {
    setSelected(null);
    onChange({ ...emptyGuardianPickerValue, mode: "new" });
  };

  const update = (field: keyof GuardianPickerValue) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value });

  if (value.mode === "existing" && selected) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between pt-4">
          <div>
            <p className="text-sm font-medium">
              <PersonLink type="guardian" id={selected.id} name={selected.full_name} newTab />
            </p>
            <p className="text-xs text-muted-foreground">
              {selected.phone}
              {selected.linked_students.length > 0 && (
                <>
                  {" "}
                  Already parent of:{" "}
                  {selected.linked_students.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <PersonLink type="student" id={s.id} name={s.name} newTab />
                    </span>
                  ))}
                </>
              )}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={startNew}>
            Change
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search existing guardians by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border p-2">
          {results.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => selectExisting(g)}
              className="flex flex-col items-start rounded-md p-2 text-left text-sm hover:bg-accent"
            >
              <span className="font-medium">{g.full_name}</span>
              <span className="text-xs text-muted-foreground">
                {g.phone}
                {g.linked_students.length > 0 && (
                  <> · Already parent of: {g.linked_students.map((s) => s.name).join(", ")}</>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-1 flex items-center gap-2">
        <UserPlusIcon className="size-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Can't find them? Enter new guardian details below.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianFullName">Full name</Label>
          <Input id="guardianFullName" value={value.fullName} onChange={update("fullName")} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianPhone">Phone</Label>
          <Input id="guardianPhone" value={value.phone} onChange={update("phone")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianAltPhone">Alternate phone</Label>
          <Input id="guardianAltPhone" value={value.altPhone} onChange={update("altPhone")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianEmail">Email</Label>
          <Input id="guardianEmail" type="email" value={value.email} onChange={update("email")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianOccupation">Occupation</Label>
          <Input id="guardianOccupation" value={value.occupation} onChange={update("occupation")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianAddress">Address</Label>
          <Input id="guardianAddress" value={value.address} onChange={update("address")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianAadhaar">Aadhaar number</Label>
          <Input id="guardianAadhaar" value={value.aadhaarNumber} onChange={update("aadhaarNumber")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guardianIncome">Annual income (₹)</Label>
          <Input id="guardianIncome" type="number" value={value.annualIncome} onChange={update("annualIncome")} />
        </div>
      </div>
    </div>
  );
}
