import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BanknoteIcon,
  BookOpenIcon,
  BusIcon,
  CalendarCheckIcon,
  CalendarOffIcon,
  ClipboardListIcon,
  DatabaseIcon,
  GraduationCapIcon,
  IdCardIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ReceiptIndianRupeeIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  StarIcon,
  TrophyIcon,
  UserCheckIcon,
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

/** Tailwind color-token name (e.g. "academics" -> bg-academics/text-academics) for this section's nav items. */
type SectionAccent = "primary" | "academics" | "staff" | "finance" | "services" | "admin";

interface NavSection {
  label: string;
  accent: SectionAccent;
  items: NavItem[];
}

const navSections: NavSection[] = [
  { label: "", accent: "primary", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboardIcon, end: true }] },
  {
    label: "Academics",
    accent: "academics",
    items: [
      { to: "/students", label: "Students & Admissions", icon: UsersIcon, permission: "students.view" },
      { to: "/alumni", label: "Alumni", icon: StarIcon, permission: "students.view" },
      {
        to: "/attendance",
        label: "Attendance",
        icon: CalendarCheckIcon,
        module: "attendance",
        permission: "attendance.view",
      },
      {
        to: "/exams",
        label: "Exams & Report Cards",
        icon: ScrollTextIcon,
        module: "exams",
        permission: "exams.view",
      },
    ],
  },
  {
    label: "Staff",
    accent: "staff",
    items: [
      { to: "/staff", label: "Staff", icon: UserSquareIcon, permission: "staff.view" },
      { to: "/payroll", label: "Payroll", icon: WalletIcon, module: "payroll", permission: "payroll.view" },
      { to: "/my-leave", label: "My Leave", icon: CalendarOffIcon },
      {
        to: "/admin/leave-requests",
        label: "Leave Requests",
        icon: UserCheckIcon,
        permission: "staff_leave.manage",
      },
    ],
  },
  {
    label: "Finance",
    accent: "finance",
    items: [
      { to: "/fees", label: "Fees & Billing", icon: ReceiptIndianRupeeIcon, module: "fees", permission: "fees.view" },
      { to: "/expenses", label: "Expenses", icon: BanknoteIcon, module: "expenses", permission: "expenses.view" },
    ],
  },
  {
    label: "Services",
    accent: "services",
    items: [
      { to: "/library", label: "Library", icon: BookOpenIcon, module: "library", permission: "library.view" },
      { to: "/transport", label: "Transport", icon: BusIcon, module: "transport", permission: "transport.view" },
      { to: "/houses", label: "Houses", icon: TrophyIcon, module: "houses", permission: "houses.view" },
      { to: "/id-cards", label: "ID Cards", icon: IdCardIcon, module: "id_cards" },
    ],
  },
  {
    label: "Admin",
    accent: "admin",
    items: [
      { to: "/academic-setup", label: "Academic Setup", icon: LayersIcon, permission: "academic_setup.view" },
      { to: "/admin/master-data", label: "Master Data", icon: DatabaseIcon, permission: "master_data.view" },
      { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheckIcon, permission: "roles.manage" },
      { to: "/admin/users", label: "Users", icon: UserCogIcon, permission: "users.manage" },
      { to: "/admin/audit-log", label: "Audit Log", icon: ClipboardListIcon, permission: "audit.view" },
    ],
  },
];

const ACCENT_STYLES: Record<SectionAccent, { activeBg: string; activeText: string; icon: string }> = {
  primary: { activeBg: "bg-primary/20", activeText: "text-white", icon: "text-primary" },
  academics: { activeBg: "bg-academics/20", activeText: "text-white", icon: "text-academics" },
  staff: { activeBg: "bg-staff/20", activeText: "text-white", icon: "text-staff" },
  finance: { activeBg: "bg-finance/20", activeText: "text-white", icon: "text-finance" },
  services: { activeBg: "bg-services/20", activeText: "text-white", icon: "text-services" },
  admin: { activeBg: "bg-admin/20", activeText: "text-white", icon: "text-admin" },
};

/** Small branch logo with a graduation-cap fallback if there's no logo, or the URL fails to load. */
function BranchLogo({ url }: { url: string | null | undefined }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || url === failedUrl) {
    return <GraduationCapIcon className="size-4.5 text-primary" />;
  }
  return <img src={url} alt="" className="size-full object-cover" onError={() => setFailedUrl(url)} />;
}

export function AppShell() {
  const session = useAppStore((s) => s.session);
  const tenant = useAppStore((s) => s.tenant);
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const selectBranch = useAppStore((s) => s.selectBranch);
  const isModuleEnabled = useAppStore((s) => s.isModuleEnabled);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();

  const currentBranch = branches.find((b) => b.id === selectedBranchId) ?? null;

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
            const accent = ACCENT_STYLES[section.accent];
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
                          ? cn(accent.activeBg, accent.activeText, "shadow-sm")
                          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn("size-4", isActive ? accent.icon : "")} />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <a
          href="https://www.vsen.ai/"
          target="_blank"
          rel="noreferrer"
          className="mx-3 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/70"
        >
          <img src="/vsen-logo.png" alt="" className="size-4 shrink-0 object-contain" />
          <span>
            Powered by <span className="font-semibold">VSEN</span>
          </span>
        </a>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b bg-card px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              <BranchLogo url={currentBranch?.logo_url} />
            </div>
            <div className="flex min-w-0 flex-col justify-center leading-tight">
              <span className="truncate text-sm font-semibold">{tenant?.name ?? "Vidyalaya"}</span>
              {branches.length > 1 ? (
                <Select value={selectedBranchId ?? undefined} onValueChange={selectBranch}>
                  <SelectTrigger
                    size="sm"
                    className="h-auto w-fit gap-1 border-none bg-transparent p-0 text-xs text-muted-foreground shadow-none hover:text-foreground focus-visible:ring-0 data-[size=sm]:h-auto"
                  >
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
              ) : (
                currentBranch && <span className="truncate text-xs text-muted-foreground">{currentBranch.name}</span>
              )}
            </div>
          </div>

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
