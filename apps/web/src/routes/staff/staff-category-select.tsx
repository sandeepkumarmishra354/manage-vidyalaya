import { useCallback, useEffect, useState } from "react";

import { api, type StaffCategory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Populates from the tenant's StaffCategory list, with an inline "+ Add new
// category" option -- typing a name and confirming creates it via POST
// /staff-categories and selects it immediately, rather than sending the
// user to a separate admin page.
export function StaffCategorySelect({ value, onChange }: { value: string; onChange: (categoryId: string) => void }) {
  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(() => {
    api.listStaffCategories().then(setCategories);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAddNew = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await api.createStaffCategory(name);
    setCategories((c) => [...c, created]);
    onChange(created.id);
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
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
        <SelectItem value="__new__">+ Add new category</SelectItem>
      </SelectContent>
    </Select>
  );
}
