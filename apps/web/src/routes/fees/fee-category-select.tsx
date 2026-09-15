import { useCallback, useEffect, useState } from "react";

import { api, type FeeCategory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Populates from the tenant's FeeCategory list, with an inline "+ Add new
// category" option -- typing a name and confirming creates it via POST
// /fee-categories and selects it immediately. Value/onChange operate on the
// category's stable `key` (what FeeStructure.fee_type actually stores),
// not its id.
export function FeeCategorySelect({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(() => {
    api.listFeeCategories().then(setCategories);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAddNew = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await api.createFeeCategory(name);
    setCategories((c) => [...c, created]);
    onChange(created.key);
    setNewName("");
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddNew();
            }
          }}
        />
        <Button type="button" size="sm" onClick={handleAddNew}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Select value={value || undefined} onValueChange={(v) => (v === "__new__" ? setIsAdding(true) : onChange(v))}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select fee category" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.key}>
            {c.name}
          </SelectItem>
        ))}
        <SelectItem value="__new__">+ Add new category</SelectItem>
      </SelectContent>
    </Select>
  );
}
