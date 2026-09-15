import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BookOpenIcon,
  BusIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  IdCardIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ReceiptIndianRupeeIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TrophyIcon,
  UserCogIcon,
  UserSquareIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import type { ModuleKey } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboardIcon;
  end?: boolean;
  module?: ModuleKey;
  permission?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  { label: "", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboardIcon, end: true }] },
  {
    label: "Academics",
    items: [
      { to: "/students", label: "Students & Admissions", icon: UsersIcon },
      { to: "/attendance", label: "Attendance", icon: CalendarCheckIcon, module: "attendance" },
      { to: "/exams", label: "Exams & Report Cards", icon: ScrollTextIcon, module: "exams" },
      { to: "/academic-setup", label: "Academic Setup", icon: LayersIcon },
    ],
  },
  {
    label: "Staff",
    items: [
      { to: "/staff", label: "Staff", icon: UserSquareIcon, permission: "staff.view" },
      { to: "/payroll", label: "Payroll", icon: WalletIcon, module: "payroll", permission: "payroll.view" },
    ],
  },
  {
    label: "Finance",
    items: [{ to: "/fees", label: "Fees & Billing", icon: ReceiptIndianRupeeIcon, module: "fees" }],
  },
  {
    label: "Services",
    items: [
      { to: "/library", label: "Library", icon: BookOpenIcon, module: "library" },
      { to: "/transport", label: "Transport", icon: BusIcon, module: "transport" },
      { to: "/houses", label: "Houses", icon: TrophyIcon, module: "houses" },
      { to: "/id-cards", label: "ID Cards", icon: IdCardIcon, module: "id_cards" },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheckIcon, permission: "roles.manage" },
      { to: "/admin/users", label: "Users", icon: UserCogIcon, permission: "users.manage" },
      { to: "/admin/audit-log", label: "Audit Log", icon: ClipboardListIcon, permission: "audit.view" },
      { to: "/settings/modules", label: "Module Settings", icon: Settings2Icon },
    ],
  },
];

export function AppShell() {
  const session = useAppStore((s) => s.session);
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const selectBranch = useAppStore((s) => s.selectBranch);
  const isModuleEnabled = useAppStore((s) => s.isModuleEnabled);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();

  const initials = session?.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="brand-gradient flex size-9 items-center justify-center rounded-xl shadow-lg shadow-primary/30">
            <GraduationCapIcon className="size-5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Vidyalaya</span>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) =>
                (!item.module || isModuleEnabled(item.module)) &&
                (!item.permission || hasPermission(item.permission)),
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label || "main"} className="flex flex-col gap-1">
                {section.label && (
                  <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-sidebar-foreground/45 uppercase">
                    {section.label}
                  </p>
                )}
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )
                    }
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b bg-card px-6 py-3">
          <Select value={selectedBranchId ?? undefined} onValueChange={selectBranch}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{session?.full_name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{session?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    navigate("/login");
                  }}
                >
                  <LogOutIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/40 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
