import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type SalaryComponent, type SalaryStructure } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatPaise } from "@/lib/money";

const emptyComponent: SalaryComponent = {
  component_name: "",
  component_type: "earning",
  calculation_type: "fixed",
  amount: 0,
  percent: null,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function SalaryStructureTab({
  staffId,
  branchId,
  dateOfJoining,
}: {
  staffId: string;
  branchId: string;
  dateOfJoining: string;
}) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("payroll.manage_salary_structure");
  const [structure, setStructure] = useState<SalaryStructure | null>(null);
  const [history, setHistory] = useState<SalaryStructure[]>([]);
  const [open, setOpen] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [basicAmount, setBasicAmount] = useState("0");
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(() => {
    api.getSalaryStructure(staffId).then((s) => {
      setStructure(s);
      if (s) {
        setEffectiveFrom(s.effective_from.slice(0, 10));
        setBasicAmount(String(s.basic_amount / 100));
        setComponents(s.components);
      }
    });
    api.listSalaryHistory(staffId).then((rows) => {
      setHistory(rows);
      // First-ever structure for this staff member: prefill the effective
      // date from their joining date rather than today.
      if (rows.length === 0) {
        setEffectiveFrom(dateOfJoining.slice(0, 10));
      }
    });
  }, [staffId, dateOfJoining]);

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
      setOpen(false);
      refresh();
    } finally {
      setIsSaving(false);
    }
  };

  // "Restore" a past structure -- since structures are insert-only (a
  // revision always appends, never overwrites), making an old one
  // "effective again" means cloning its basic amount + components into a
  // brand new row with a fresh effective_from.
  const handleMakeEffective = async (past: SalaryStructure) => {
    const date = window.prompt("Make this structure effective from:", todayIso());
    if (!date) return;
    await api.setSalaryStructure({
      staff_id: staffId,
      branch_id: branchId,
      effective_from: date,
      basic_amount: past.basic_amount,
      components: past.components,
    });
    refresh();
  };

  const updateComponent = (i: number, patch: Partial<SalaryComponent>) => {
    setComponents((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  if (!canManage) {
    return structure ? (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Basic</p>
            <p className="font-medium">{formatPaise(structure.basic_amount)}</p>
          </div>
        </div>
        <SalaryHistoryList history={history} canManage={false} onMakeEffective={handleMakeEffective} />
      </div>
    ) : (
      <p className="text-muted-foreground">No salary structure set up yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SalaryHistoryList history={history} canManage={canManage} onMakeEffective={handleMakeEffective} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-fit">Record a salary revision</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record a salary revision</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Saving here always records a new increment effective from the date below -- it never overwrites past
            history, and a new payroll run automatically uses whichever structure was in force for that month.
          </p>
          <div className="flex flex-col gap-4">
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
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save salary structure"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Every historical structure, most recent first -- the increment history a
// "record a revision" save builds up over time. Each row expands to show
// its full component breakdown, and (when manageable) a "Make effective"
// action to clone an older structure forward as a new, current one.
function SalaryHistoryList({
  history,
  canManage,
  onMakeEffective,
}: {
  history: SalaryStructure[];
  canManage: boolean;
  onMakeEffective: (structure: SalaryStructure) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Salary history</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {history.map((s, i) => {
            const isExpanded = expandedId === s.id;
            return (
              <div key={s.id} className="rounded-md border text-sm">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 p-2 text-left hover:bg-accent/50"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
                    <span className="font-medium">Effective {s.effective_from.slice(0, 10)}</span>
                    {i === 0 && <Badge variant="success">Latest</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>Basic {formatPaise(s.basic_amount)}</span>
                    <span>
                      {s.components.length} component{s.components.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="flex flex-col gap-2 border-t p-2">
                    {s.components.length === 0 ? (
                      <p className="text-muted-foreground">No additional components.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {s.components.map((c, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2">
                            <span>
                              {c.component_name}{" "}
                              <span className="text-xs text-muted-foreground capitalize">({c.component_type})</span>
                            </span>
                            <span className="font-medium">
                              {c.calculation_type === "percent_of_basic" ? `${c.percent ?? 0}%` : formatPaise(c.amount ?? 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {canManage && i !== 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        onClick={() => onMakeEffective(s)}
                      >
                        Make effective from today
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
