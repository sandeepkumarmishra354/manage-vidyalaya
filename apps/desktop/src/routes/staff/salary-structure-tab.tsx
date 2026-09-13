import { useCallback, useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type SalaryComponent, type SalaryStructure } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPaise } from "@/lib/money";

const emptyComponent: SalaryComponent = {
  component_name: "",
  component_type: "earning",
  calculation_type: "fixed",
  amount: 0,
  percent: null,
};

export function SalaryStructureTab({ staffId, branchId }: { staffId: string; branchId: string }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [structure, setStructure] = useState<SalaryStructure | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [basicAmount, setBasicAmount] = useState("0");
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(() => {
    api.getSalaryStructure(staffId).then((s) => {
      setStructure(s);
      if (s) {
        setEffectiveFrom(s.effective_from);
        setBasicAmount(String(s.basic_amount / 100));
        setComponents(s.components);
      }
    });
  }, [staffId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.setSalaryStructure({
        staff_id: staffId,
        branch_id: branchId,
        effective_from: effectiveFrom,
        basic_amount: Math.round(Number(basicAmount) * 100),
        components,
      });
      refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const updateComponent = (i: number, patch: Partial<SalaryComponent>) => {
    setComponents((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  if (!hasPermission("payroll.generate")) {
    return structure ? (
      <div className="grid grid-cols-2 gap-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Basic</p>
          <p className="font-medium">{formatPaise(structure.basic_amount)}</p>
        </div>
      </div>
    ) : (
      <p className="text-muted-foreground">No salary structure set up yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Salary structure</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Effective from</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-44" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Basic (₹/month)</Label>
              <Input type="number" value={basicAmount} onChange={(e) => setBasicAmount(e.target.value)} className="w-36" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {components.map((c, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Component</Label>
                  <Input
                    value={c.component_name}
                    onChange={(e) => updateComponent(i, { component_name: e.target.value })}
                    className="w-40"
                    placeholder="e.g. HRA"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={c.component_type}
                    onValueChange={(v) => updateComponent(i, { component_type: v as SalaryComponent["component_type"] })}
                  >
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="earning">Earning</SelectItem>
                      <SelectItem value="deduction">Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Calculation</Label>
                  <Select
                    value={c.calculation_type}
                    onValueChange={(v) => updateComponent(i, { calculation_type: v as SalaryComponent["calculation_type"] })}
                  >
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                      <SelectItem value="percent_of_basic">% of basic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {c.calculation_type === "fixed" ? (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Amount (₹)</Label>
                    <Input
                      type="number"
                      value={(c.amount ?? 0) / 100}
                      onChange={(e) => updateComponent(i, { amount: Math.round(Number(e.target.value) * 100) })}
                      className="w-28"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Percent</Label>
                    <Input
                      type="number"
                      value={c.percent ?? 0}
                      onChange={(e) => updateComponent(i, { percent: Number(e.target.value) })}
                      className="w-24"
                    />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setComponents((cs) => cs.filter((_, idx) => idx !== i))}
                >
                  <TrashIcon />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setComponents((cs) => [...cs, { ...emptyComponent }])}>
              <PlusIcon />
              Add component
            </Button>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-fit">
            {isSaving ? "Saving..." : "Save salary structure"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
