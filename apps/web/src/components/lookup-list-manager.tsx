import { useState } from "react";
import { PencilIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LookupListItem {
  id: string;
  name: string;
  is_system?: boolean;
}

// Generic admin CRUD widget for a simple "name-only" lookup list -- an
// inline add row + badge chips with rename/delete, matching the existing
// class/section/subject/elective badge-chip pattern in academic-setup-page.
// Works against any list by taking the CRUD calls as props, so it's reused
// for both the new generic Master Data endpoints and the existing
// dedicated Staff/Fee Category endpoints.
export function LookupListManager({
  label,
  items,
  canManage,
  onCreate,
  onUpdate,
  onDelete,
}: {
  label: string;
  items: LookupListItem[];
  canManage: boolean;
  onCreate: (name: string) => Promise<void>;
  onUpdate: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsSaving(true);
    try {
      await onCreate(name);
      setNewName("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRename = (item: LookupListItem) => {
    const name = window.prompt(`Rename "${item.name}" to:`, item.name);
    if (!name || !name.trim() || name.trim() === item.name) return;
    onUpdate(item.id, name.trim());
  };

  const handleDelete = (item: LookupListItem) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    onDelete(item.id);
  };

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex gap-2">
          <Input
            placeholder={`New ${label.toLowerCase()} value`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" size="sm" onClick={handleAdd} disabled={isSaving || !newName.trim()}>
            Add
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item.id} variant="outline" className="gap-1">
            {item.name}
            {canManage && !item.is_system && (
              <>
                <button
                  type="button"
                  onClick={() => handleRename(item)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <PencilIcon className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <XIcon className="size-3" />
                </button>
              </>
            )}
          </Badge>
        ))}
        {items.length === 0 && <span className="text-muted-foreground">No values yet.</span>}
      </div>
    </div>
  );
}
