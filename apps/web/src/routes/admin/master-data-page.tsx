import { useCallback, useEffect, useMemo, useState } from "react";
import { PencilIcon, XIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  MASTER_DATA_TYPES,
  MASTER_DATA_TYPE_LABELS,
  type LeaveType,
  type MasterDataType,
  type StaffCategory,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LookupListManager } from "@/components/lookup-list-manager";
import { ClassesAndSectionsTab } from "@/routes/admin/master-data/classes-sections-tab";
import { AcademicSessionsTab } from "@/routes/admin/master-data/academic-sessions-tab";
import { SubjectsElectivesTab } from "@/routes/admin/master-data/subjects-electives-tab";
import { HousesTab } from "@/routes/admin/master-data/houses-tab";

const MASTER_DATA_MANAGE_PERMISSION: Record<MasterDataType, string> = {
  gender: "master_data.manage_gender",
  blood_group: "master_data.manage_blood_group",
  religion: "master_data.manage_religion",
  nationality: "master_data.manage_nationality",
  mother_tongue: "master_data.manage_mother_tongue",
  student_category: "master_data.manage_student_category",
  guardian_relation: "master_data.manage_guardian_relation",
  expense_category: "master_data.manage_expense_category",
};

function MasterDataLookupTab({ type }: { type: MasterDataType }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission(MASTER_DATA_MANAGE_PERMISSION[type]);
  const [items, setItems] = useState<{ id: string; name: string; is_system: boolean }[]>([]);

  const refresh = useCallback(() => {
    api.listMasterDataItems(type).then(setItems);
  }, [type]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <LookupListManager
      label={MASTER_DATA_TYPE_LABELS[type]}
      items={items}
      canManage={canManage}
      onCreate={async (name) => {
        await api.createMasterDataItem(type, name);
        refresh();
      }}
      onUpdate={async (id, name) => {
        await api.updateMasterDataItem(id, name);
        refresh();
      }}
      onDelete={async (id) => {
        await api.deleteMasterDataItem(id);
        refresh();
      }}
    />
  );
}

function StaffCategoryTab() {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("master_data.manage_staff_category");
  const [items, setItems] = useState<{ id: string; name: string; is_system: boolean }[]>([]);

  const refresh = useCallback(() => {
    api.listStaffCategories().then(setItems);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <LookupListManager
      label="Staff Category"
      items={items}
      canManage={canManage}
      onCreate={async (name) => {
        await api.createStaffCategory(name);
        refresh();
      }}
      onUpdate={async (id, name) => {
        await api.updateStaffCategory(id, name);
        refresh();
      }}
      onDelete={async (id) => {
        await api.deleteStaffCategory(id);
        refresh();
      }}
    />
  );
}

function LeaveTypeQuotasDialog({
  leaveType,
  categories,
  onClose,
}: {
  leaveType: LeaveType;
  categories: StaffCategory[];
  onClose: () => void;
}) {
  const [quotas, setQuotas] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api.listLeaveTypeQuotas(leaveType.id).then((rows) => {
      const byCategory: Record<string, string> = {};
      for (const row of rows) {
        byCategory[row.staff_category_id ?? "default"] = String(row.monthly_accrual_days);
      }
      setQuotas(byCategory);
      setIsLoading(false);
    });
  }, [leaveType.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const entries = [{ key: "default", staff_category_id: null as string | null }, ...categories.map((c) => ({ key: c.id, staff_category_id: c.id }))]
        .map(({ key, staff_category_id }) => ({ staff_category_id, monthly_accrual_days: Number(quotas[key] ?? 0) }))
        .filter((q) => q.monthly_accrual_days > 0);
      await api.setLeaveTypeQuotas(leaveType.id, entries);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{leaveType.name}: monthly accrual by staff category</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Days credited per completed month, per staff category. A category left at 0 falls back to
              "Default"; leave everything at 0 to keep this type unlimited/always paid for a category.
            </p>
            <div className="flex items-center justify-between gap-4">
              <Label className="min-w-0 flex-1">Default (no category / not listed below)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                className="w-24"
                value={quotas.default ?? ""}
                onChange={(e) => setQuotas((prev) => ({ ...prev, default: e.target.value }))}
              />
            </div>
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4">
                <Label className="min-w-0 flex-1">{c.name}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-24"
                  value={quotas[c.id] ?? ""}
                  onChange={(e) => setQuotas((prev) => ({ ...prev, [c.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save quotas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypesTab() {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("master_data.manage_leave_type");
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [newName, setNewName] = useState("");
  const [newQuotaEnabled, setNewQuotaEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [quotasFor, setQuotasFor] = useState<LeaveType | null>(null);

  const refresh = useCallback(() => {
    api.listLeaveTypes().then(setTypes);
  }, []);

  useEffect(() => {
    refresh();
    api.listStaffCategories().then(setCategories);
  }, [refresh]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsSaving(true);
    try {
      await api.createLeaveType(name, newQuotaEnabled);
      setNewName("");
      setNewQuotaEnabled(false);
      refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not add this leave type.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleQuota = async (type: LeaveType) => {
    await api.updateLeaveType(type.id, { quota_enabled: !type.quota_enabled });
    refresh();
  };

  const handleRename = async (type: LeaveType) => {
    const name = window.prompt(`Rename "${type.name}" to:`, type.name);
    if (!name || !name.trim() || name.trim() === type.name) return;
    await api.updateLeaveType(type.id, { name: name.trim() });
    refresh();
  };

  const handleDelete = async (type: LeaveType) => {
    if (!window.confirm(`Delete leave type "${type.name}"?`)) return;
    try {
      await api.deleteLeaveType(type.id);
      refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete this leave type.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="New leave type, e.g. Maternity Leave"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="max-w-xs"
          />
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={newQuotaEnabled}
              onChange={(e) => setNewQuotaEnabled(e.target.checked)}
            />
            Track a quota/entitlement
          </label>
          <Button type="button" size="sm" onClick={handleAdd} disabled={isSaving || !newName.trim()}>
            Add
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {types.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{t.name}</span>
              {t.quota_enabled ? (
                <Badge variant="info">Quota-tracked</Badge>
              ) : (
                <Badge variant="outline">Unlimited, always paid</Badge>
              )}
            </div>
            {canManage && (
              <div className="flex items-center gap-1">
                {t.quota_enabled && (
                  <Button variant="outline" size="sm" onClick={() => setQuotasFor(t)}>
                    Set quotas
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleToggleQuota(t)}>
                  {t.quota_enabled ? "Disable quota" : "Enable quota"}
                </Button>
                {!t.is_system && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => handleRename(t)}>
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(t)}>
                      <XIcon className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {types.length === 0 && <span className="text-muted-foreground">No leave types yet.</span>}
      </div>

      {quotasFor && (
        <LeaveTypeQuotasDialog leaveType={quotasFor} categories={categories} onClose={() => setQuotasFor(null)} />
      )}
    </div>
  );
}

function FeeCategoryTab() {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("master_data.manage_fee_category");
  const [items, setItems] = useState<{ id: string; name: string; is_system: boolean }[]>([]);

  const refresh = useCallback(() => {
    api.listFeeCategories().then(setItems);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <LookupListManager
      label="Fee Category"
      items={items}
      canManage={canManage}
      onCreate={async (name) => {
        await api.createFeeCategory(name);
        refresh();
      }}
      onUpdate={async (id, name) => {
        await api.updateFeeCategory(id, name);
        refresh();
      }}
      onDelete={async (id) => {
        await api.deleteFeeCategory(id);
        refresh();
      }}
    />
  );
}

interface MasterDataEntry {
  key: string;
  label: string;
  permission: string;
  render: () => React.ReactNode;
}

interface MasterDataGroup {
  label: string;
  entries: MasterDataEntry[];
}

export function MasterDataPage() {
  const hasPermission = useAppStore((s) => s.hasPermission);

  const groups: MasterDataGroup[] = useMemo(
    () => [
      {
        label: "Academic",
        entries: [
          {
            key: "classes_sections",
            label: "Classes & Sections",
            permission: "academic_setup.manage_classes",
            render: () => <ClassesAndSectionsTab />,
          },
          {
            key: "academic_sessions",
            label: "Academic Sessions",
            permission: "academic_setup.manage_sessions",
            render: () => <AcademicSessionsTab />,
          },
          {
            key: "subjects_electives",
            label: "Subjects & Electives",
            permission: "exams.manage_subjects",
            render: () => <SubjectsElectivesTab />,
          },
          {
            key: "houses",
            label: "Houses",
            permission: "houses.manage_teams",
            render: () => <HousesTab />,
          },
        ],
      },
      {
        label: "People",
        entries: [
          ...MASTER_DATA_TYPES.filter((type) => type !== "expense_category").map((type) => ({
            key: type,
            label: MASTER_DATA_TYPE_LABELS[type],
            permission: MASTER_DATA_MANAGE_PERMISSION[type],
            render: () => <MasterDataLookupTab type={type} />,
          })),
          {
            key: "staff_category",
            label: "Staff Category",
            permission: "master_data.manage_staff_category",
            render: () => <StaffCategoryTab />,
          },
          {
            key: "leave_type",
            label: "Leave Types",
            permission: "master_data.manage_leave_type",
            render: () => <LeaveTypesTab />,
          },
        ],
      },
      {
        label: "Finance",
        entries: [
          {
            key: "fee_category",
            label: "Fee Category",
            permission: "master_data.manage_fee_category",
            render: () => <FeeCategoryTab />,
          },
          {
            key: "expense_category",
            label: "Expense Category",
            permission: "master_data.manage_expense_category",
            render: () => <MasterDataLookupTab type="expense_category" />,
          },
        ],
      },
    ],
    [],
  );

  const visibleGroups = groups.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => hasPermission(entry.permission)),
  }));

  const firstVisibleEntry = visibleGroups.flatMap((g) => g.entries)[0];
  const [activeKey, setActiveKey] = useState<string | undefined>(firstVisibleEntry?.key);

  const activeEntry = visibleGroups.flatMap((g) => g.entries).find((e) => e.key === activeKey) ?? firstVisibleEntry;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Master Data</h1>
        <p className="text-muted-foreground">
          Manage the lookup lists used across the app's dropdowns. Only the sections you've been granted access to
          appear below.
        </p>
      </div>
      <div className="flex gap-6">
        <nav className="flex w-64 shrink-0 flex-col gap-4">
          {visibleGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </p>
              {group.entries.length === 0 && (
                <p className="px-2 text-sm text-muted-foreground">No access</p>
              )}
              {group.entries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setActiveKey(entry.key)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors",
                    activeEntry?.key === entry.key
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {activeEntry ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{activeEntry.label}</CardTitle>
              </CardHeader>
              <CardContent>{activeEntry.render()}</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                You don't have access to any master data sections yet. Ask a super admin to grant you specific
                permissions on the Roles & Permissions page.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
