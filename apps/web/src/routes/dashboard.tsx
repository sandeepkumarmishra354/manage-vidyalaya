import {
  AlertTriangleIcon,
  BookOpenIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClockIcon,
  PartyPopperIcon,
  ReceiptIndianRupeeIcon,
  ScrollTextIcon,
  TrendingUpIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useAppStore } from "@/stores/app-store";
import { api, type NeedsAttentionResponse, type NeedsAttentionSection as NeedsAttentionSectionType } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/icon-tile";

const FEE_STATUS_COLORS: Record<string, string> = {
  paid: "var(--color-success)",
  partial: "var(--color-warning)",
  pending: "var(--color-info)",
  overdue: "var(--color-destructive)",
  waived: "var(--color-muted-foreground)",
};

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  hint?: string;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundImage: `linear-gradient(90deg, ${accent}, color-mix(in oklch, ${accent} 40%, transparent))` }}
      />
      <CardContent className="flex items-center gap-4 pt-6">
        <IconTile icon={Icon} accent={accent} size="md" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const session = useAppStore((s) => s.session);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const isModuleEnabled = useAppStore((s) => s.isModuleEnabled);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const housesEnabled = isModuleEnabled("houses");
  const canViewFees = hasPermission("fees.view");
  const canViewExams = hasPermission("exams.view");

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", selectedBranchId],
    queryFn: () => api.getDashboardStats(selectedBranchId!),
    enabled: !!selectedBranchId,
  });
  const { data: needsAttention } = useQuery({
    queryKey: ["needs-attention", selectedBranchId],
    queryFn: () => api.getNeedsAttention(selectedBranchId!),
    enabled: !!selectedBranchId,
  });
  const { data: leaderboard = [] } = useQuery({
    queryKey: ["house-leaderboard", selectedBranchId],
    queryFn: () => api.getHouseLeaderboard(selectedBranchId!),
    enabled: !!selectedBranchId && housesEnabled,
  });

  if (!stats) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  const attendancePct =
    stats.todays_attendance_total > 0
      ? Math.round((stats.todays_attendance_present / stats.todays_attendance_total) * 100)
      : null;

  const trendData = stats.attendance_trend.map((p) => ({
    date: p.attendance_date.slice(5),
    pct: p.total_count > 0 ? Math.round((p.present_count / p.total_count) * 100) : 0,
  }));

  const feeData = (stats.fee_status_breakdown ?? []).filter((f) => f.count > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {session?.full_name?.split(" ")[0]}</h1>
        <p className="text-muted-foreground">Here's what's happening at this branch today.</p>
      </div>

      {needsAttention && <NeedsAttentionCard data={needsAttention} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={UsersIcon}
          label="Enrolled Students"
          value={String(stats.enrolled_count)}
          hint={`${stats.applied_count} pending admission`}
          accent="var(--color-academics)"
        />
        <StatCard
          icon={CalendarCheckIcon}
          label="Today's Attendance"
          value={attendancePct !== null ? `${attendancePct}%` : "Not marked"}
          hint={
            stats.todays_attendance_total > 0
              ? `${stats.todays_attendance_present} / ${stats.todays_attendance_total} present`
              : undefined
          }
          accent="var(--color-success)"
        />
        {canViewFees && (
          <StatCard
            icon={ReceiptIndianRupeeIcon}
            label="Fees Collected"
            value={formatPaise(stats.fee_collected_paise ?? 0)}
            hint={`${formatPaise(stats.fee_pending_paise ?? 0)} pending`}
            accent="var(--color-finance)"
          />
        )}
        {isModuleEnabled("library") && (
          <StatCard
            icon={BookOpenIcon}
            label="Overdue Books"
            value={String(stats.overdue_books_count)}
            accent="var(--color-services)"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="size-4 text-academics" />
              Enrollment by class
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {stats.enrollment_by_class.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.enrollment_by_class}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="class_name" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      borderColor: "var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name="Students" fill="var(--color-academics)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No classes set up yet." />
            )}
          </CardContent>
        </Card>

        {canViewFees && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptIndianRupeeIcon className="size-4 text-finance" />
                Fee status
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {feeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={feeData} dataKey="count" nameKey="status" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {feeData.map((entry) => (
                        <Cell key={entry.status} fill={FEE_STATUS_COLORS[entry.status] ?? "var(--color-muted)"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-popover)",
                        borderColor: "var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No invoices yet." />
              )}
            </CardContent>
            {feeData.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-6 pb-4 text-xs">
                {feeData.map((f) => (
                  <div key={f.status} className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: FEE_STATUS_COLORS[f.status] ?? "var(--color-muted)" }}
                    />
                    <span className="capitalize text-muted-foreground">{f.status}</span>
                    <span className="font-medium">{f.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUpIcon className="size-4 text-success" />
              Attendance trend (last 14 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12 }}
                    stroke="var(--color-muted-foreground)"
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Present"]}
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      borderColor: "var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pct"
                    stroke="var(--color-success)"
                    fill="url(#attendanceFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No attendance marked yet." />
            )}
          </CardContent>
        </Card>

        {isModuleEnabled("houses") && leaderboard.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrophyIcon className="size-4 text-services" />
                House leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {leaderboard.slice(0, 5).map((house, i) => (
                <div key={house.house_id} className="flex items-center gap-2.5">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: house.color ?? "var(--color-muted-foreground)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium">{house.house_name}</span>
                  <span className="text-sm font-bold">{house.total_points}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PartyPopperIcon className="size-4 text-staff" />
              Birthdays
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <BirthdayList title="Today" entries={stats.birthdays_today} />
            <BirthdayList title="Tomorrow" entries={stats.birthdays_tomorrow} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDaysIcon className="size-4 text-academics" />
              Upcoming holidays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.upcoming_holidays.length > 0 ? (
              <div className="flex flex-col gap-2 text-sm">
                {stats.upcoming_holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{h.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(h.date)}
                      {h.type === "half_day" ? " (half-day)" : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No holidays in the next 2 weeks.</p>
            )}
          </CardContent>
        </Card>

        {canViewExams && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollTextIcon className="size-4 text-exams" />
                Upcoming exams
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.upcoming_exams.length > 0 ? (
                <div className="flex flex-col gap-2 text-sm">
                  {stats.upcoming_exams.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2">
                      <span className="font-medium">{e.name}</span>
                      <span className="text-xs text-muted-foreground">{e.exam_date ? formatDate(e.exam_date) : "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No exams in the next 2 weeks.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const NEEDS_ATTENTION_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function NeedsAttentionCard({ data }: { data: NeedsAttentionResponse }) {
  const allEmpty = Object.values(data).every((section) => !section || section.items.length === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangleIcon className="size-4 text-warning" />
          Needs Attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {allEmpty ? (
          <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.pending_leave && (
              <AttentionSection
                icon={ClockIcon}
                label="Pending leave requests"
                section={data.pending_leave}
                linkTo="/admin/leave-requests"
                renderRow={(item) => ({
                  name: item.staff_name,
                  meta:
                    item.start_date === item.end_date
                      ? formatDate(item.start_date)
                      : `${formatDate(item.start_date)} – ${formatDate(item.end_date)}`,
                })}
              />
            )}
            {data.pending_admissions && (
              <AttentionSection
                icon={UserPlusIcon}
                label="Pending admissions"
                section={data.pending_admissions}
                linkTo="/students"
                renderRow={(item) => ({ name: item.student_name, meta: formatDate(item.applied_at) })}
              />
            )}
            {data.overdue_books && (
              <AttentionSection
                icon={BookOpenIcon}
                label="Overdue books"
                section={data.overdue_books}
                linkTo="/library"
                renderRow={(item) => ({ name: `${item.student_name} — ${item.book_title}`, meta: formatDate(item.due_date) })}
              />
            )}
            {data.overdue_fees && (
              <AttentionSection
                icon={ReceiptIndianRupeeIcon}
                label="Overdue fees"
                section={data.overdue_fees}
                linkTo="/fees"
                renderRow={(item) => ({
                  name: item.student_name,
                  meta: formatPaise(item.amount_due - item.amount_paid),
                })}
              />
            )}
            {data.unpublished_exams && (
              <AttentionSection
                icon={ScrollTextIcon}
                label="Results to publish"
                section={data.unpublished_exams}
                linkTo="/exams"
                renderRow={(item) => ({ name: item.name, meta: formatDate(item.exam_date) })}
              />
            )}
            {data.draft_promotions && (
              <AttentionSection
                icon={TrendingUpIcon}
                label="Draft promotions"
                section={data.draft_promotions}
                linkTo="/academic-setup"
                renderRow={(item) => ({
                  name: `${item.from_session_name} → ${item.to_session_name}`,
                  meta: "Draft",
                })}
              />
            )}
            {data.draft_payroll_runs && (
              <AttentionSection
                icon={WalletIcon}
                label="Unfinalized payroll runs"
                section={data.draft_payroll_runs}
                linkTo="/payroll"
                renderRow={(item) => ({
                  name: `${NEEDS_ATTENTION_MONTH_NAMES[item.period_month - 1]} ${item.period_year}`,
                  meta: "Draft",
                })}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionSection<T extends { id: string }>({
  icon: Icon,
  label,
  section,
  linkTo,
  renderRow,
}: {
  icon: typeof UsersIcon;
  label: string;
  section: NeedsAttentionSectionType<T>;
  linkTo: string;
  renderRow: (item: T) => { name: string; meta: string };
}) {
  if (section.items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">{label}</span>
        <Badge variant="warning">{section.total_count}</Badge>
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {section.items.map((item) => {
          const { name, meta } = renderRow(item);
          return (
            <Link
              key={item.id}
              to={linkTo}
              className="flex items-center justify-between gap-3 py-1.5 text-sm transition-colors hover:text-primary"
            >
              <span className="truncate">{name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
            </Link>
          );
        })}
      </div>
      {section.total_count > section.items.length && (
        <Link to={linkTo} className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline">
          +{section.total_count - section.items.length} more
        </Link>
      )}
    </div>
  );
}

function BirthdayList({ title, entries }: { title: string; entries: { id: string; name: string; role: string }[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">{title}</p>
      {entries.length > 0 ? (
        <div className="flex flex-col gap-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm">
              <span>{e.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{e.role}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">None</p>
      )}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}
