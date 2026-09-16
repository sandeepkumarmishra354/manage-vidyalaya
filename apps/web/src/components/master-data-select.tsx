import { useEffect, useState } from "react";

import { api, type MasterDataItem, type MasterDataType } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Form-field picker counterpart to LookupListManager, modeled on the
// existing StaffCategorySelect/FeeCategorySelect pattern -- fetches the
// tenant's list for `type` and renders it as a Select. Unlike those two,
// there's no inline "+ Add new" here: creating new values now belongs on
// the Master Data admin page. Populates the field by *name*, not id, since
// Student/Staff/Guardian columns store these as plain strings (see the
// Master Data plan's data-model notes).
export function MasterDataSelect({
  type,
  value,
  onChange,
  placeholder = "Select...",
}: {
  type: MasterDataType;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [items, setItems] = useState<MasterDataItem[]>([]);

  useEffect(() => {
    api.listMasterDataItems(type).then(setItems);
  }, [type]);

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.name}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
