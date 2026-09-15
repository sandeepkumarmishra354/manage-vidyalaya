import { useEffect, useState } from "react";
import {
  BookOpenIcon,
  BusIcon,
  CalendarCheckIcon,
  IdCardIcon,
  ReceiptIndianRupeeIcon,
  ScrollTextIcon,
  TrophyIcon,
  WalletIcon,
} from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type ModuleKey, type ModuleSetting } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MODULE_META: Record<ModuleKey, { label: string; description: string; icon: typeof CalendarCheckIcon }> = {
  attendance: {
    label: "Attendance",
    description: "Daily attendance marking and history.",
    icon: CalendarCheckIcon,
  },
  fees: {
    label: "Fees & Billing",
    description: "Fee structures, invoices, and payments.",
    icon: ReceiptIndianRupeeIcon,
  },
  exams: {
    label: "Exams & Report Cards",
    description: "Subjects, exams, marks entry, report cards.",
    icon: ScrollTextIcon,
  },
  library: {
    label: "Library",
    description: "Book catalog and issue/return tracking.",
    icon: BookOpenIcon,
  },
  transport: {
    label: "Transport",
    description: "Bus routes, stops, and student assignments.",
    icon: BusIcon,
  },
  houses: {
    label: "Houses",
    description: "House teams, points, and leaderboard.",
    icon: TrophyIcon,
  },
  id_cards: {
    label: "ID Cards",
    description: "Student ID card generation and printing.",
    icon: IdCardIcon,
  },
  payroll: {
    label: "Payroll",
    description: "Salary structures, payroll runs, and payslips.",
    icon: WalletIcon,
  },
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function ModuleSettingsPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const refreshModuleSettings = useAppStore((s) => s.refreshModuleSettings);
  const [settings, setSettings] = useState<ModuleSetting[]>([]);

  useEffect(() => {
    if (selectedBranchId) api.getModuleSettings(selectedBranchId).then(setSettings);
  }, [selectedBranchId]);

  const handleToggle = async (moduleKey: ModuleKey, isEnabled: boolean) => {
    if (!selectedBranchId) return;
    setSettings((prev) => prev.map((s) => (s.module_key === moduleKey ? { ...s, is_enabled: isEnabled } : s)));
    await api.setModuleEnabled(selectedBranchId, moduleKey, isEnabled);
    await refreshModuleSettings();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Module Settings</h1>
        <p className="text-muted-foreground">
          Turn modules on or off for this branch. Disabled modules are hidden from the nav and their
          data stays put -- re-enable anytime.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {settings.map((setting) => {
          const meta = MODULE_META[setting.module_key];
          const Icon = meta.icon;
          return (
            <Card key={setting.module_key}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{meta.label}</CardTitle>
                  <CardDescription>{meta.description}</CardDescription>
                </div>
                <Toggle
                  checked={setting.is_enabled}
                  onChange={(checked) => handleToggle(setting.module_key, checked)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CardHeader className="px-0">
        <CardDescription>
          Student Info & Admissions, Academic Setup, and the Dashboard are core and always available.
        </CardDescription>
      </CardHeader>
    </div>
  );
}
