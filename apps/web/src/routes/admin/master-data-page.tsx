import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, MASTER_DATA_TYPES, MASTER_DATA_TYPE_LABELS, type MasterDataType } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
