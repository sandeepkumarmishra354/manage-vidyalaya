import { useEffect, useState } from "react";
import {
  BookOpenIcon,
  CalendarCheckIcon,
  ReceiptIndianRupeeIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
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

import { useAppStore } from "@/stores/app-store";
import { api, type DashboardStats, type HouseLeaderboardRow } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklch, ${accent} 15%, transparent)`, color: accent }}
        >
          <Icon className="size-5" />
        </div>
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<HouseLeaderboardRow[]>([]);

  useEffect(() => {
    if (!selectedBranchId) return;
    api.getDashboardStats(selectedBranchId).then(setStats);
    if (isModuleEnabled("houses")) {
      api.getHouseLeaderboard(selectedBranchId).then(setLeaderboard);
    }
  }, [selectedBranchId, isModuleEnabled]);

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

  const feeData = stats.fee_status_breakdown.filter((f) => f.count > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {session?.full_name?.split(" ")[0]}</h1>
        <p className="text-muted-foreground">Here's what's happening at this branch today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={UsersIcon}
          label="Enrolled Students"
          value={String(stats.enrolled_count)}
          hint={`${stats.applied_count} pending admission`}
          accent="var(--color-primary)"
        />
        {isModuleEnabled("attendance") && (
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
        )}
        {isModuleEnabled("fees") && (
          <StatCard
            icon={ReceiptIndianRupeeIcon}
            label="Fees Collected"
            value={formatPaise(stats.fee_collected_paise)}
            hint={`${formatPaise(stats.fee_pending_paise)} pending`}
            accent="var(--color-warning)"
          />
        )}
        {isModuleEnabled("library") && (
          <StatCard
            icon={BookOpenIcon}
            label="Overdue Books"
            value={String(stats.overdue_books_count)}
            accent="var(--color-destructive)"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="size-4 text-primary" />
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
                  <Bar dataKey="count" name="Students" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No classes set up yet." />
            )}
          </CardContent>
        </Card>

        {isModuleEnabled("fees") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptIndianRupeeIcon className="size-4 text-warning" />
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
        {isModuleEnabled("attendance") && (
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
        )}

        {isModuleEnabled("houses") && leaderboard.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrophyIcon className="size-4 text-primary" />
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
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}
