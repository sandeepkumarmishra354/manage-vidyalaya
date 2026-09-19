import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAppStore } from "@/stores/app-store";
import type { ModuleKey } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { LoginPage } from "@/routes/login";
import { DashboardPage } from "@/routes/dashboard";
import { StudentListPage } from "@/routes/students/student-list";
import { AlumniPage } from "@/routes/students/alumni-page";
import { StudentDetailPage } from "@/routes/students/student-detail";
import { GuardianDetailPage } from "@/routes/students/guardian-detail";
import { AttendancePage } from "@/routes/attendance/attendance-page";
import { ScanAttendancePage } from "@/routes/attendance/scan-attendance-page";
import { FeesPage } from "@/routes/fees/fees-page";
import { ExamsPage } from "@/routes/exams/exams-page";
import { AcademicSetupPage } from "@/routes/academic/academic-setup-page";
import { MasterDataPage } from "@/routes/admin/master-data-page";
import { HousesPage } from "@/routes/houses/houses-page";
import { LibraryPage } from "@/routes/library/library-page";
import { TransportPage } from "@/routes/transport/transport-page";
import { IdCardsPage } from "@/routes/id-cards/id-cards-page";
import { StaffListPage } from "@/routes/staff/staff-list";
import { TimetablePage } from "@/routes/timetable/timetable-page";
import { StaffDetailPage } from "@/routes/staff/staff-detail";
import { MyLeavePage } from "@/routes/staff/my-leave-page";
import { LeaveRequestsPage } from "@/routes/staff/leave-requests-page";
import { PayrollPage } from "@/routes/payroll/payroll-page";
import { ExpensesPage } from "@/routes/expenses/expenses-page";
import { PayrollRunDetailPage } from "@/routes/payroll/payroll-run-detail";
import { RolesPage } from "@/routes/admin/roles-page";
import { UsersPage } from "@/routes/admin/users-page";
import { AuditLogPage } from "@/routes/admin/audit-log-page";
import { ReportsPage } from "@/routes/reports/reports-page";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useAppStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Redirects to the dashboard if the branch has this module turned off,
 * so a disabled module's route can't be reached by URL even without a nav
 * link -- defense in depth beyond just hiding the nav item. */
function RequireModule({ module, children }: { module: ModuleKey; children: React.ReactNode }) {
  const isModuleEnabled = useAppStore((s) => s.isModuleEnabled);
  if (!isModuleEnabled(module)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Redirects to the dashboard if the current user lacks the permission --
 * defense in depth beyond just hiding the nav item/button, same as
 * RequireModule above. */
function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  if (!hasPermission(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Same as RequirePermission, but passes if the user holds ANY of the given
 * permissions -- for pages that serve more than one role (e.g. the scan
 * page works for whoever holds attendance.mark OR staff_attendance.mark). */
function RequireAnyPermission({ permissions, children }: { permissions: string[]; children: React.ReactNode }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  if (!permissions.some((p) => hasPermission(p))) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const isBootstrapping = useAppStore((s) => s.isBootstrapping);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (isBootstrapping) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-muted-foreground">
        Loading Vidyalaya...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="students"
          element={
            <RequirePermission permission="students.view">
              <StudentListPage />
            </RequirePermission>
          }
        />
        <Route
          path="students/:id"
          element={
            <RequirePermission permission="students.view">
              <StudentDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="alumni"
          element={
            <RequirePermission permission="students.view">
              <AlumniPage />
            </RequirePermission>
          }
        />
        <Route
          path="guardians/:id"
          element={
            <RequirePermission permission="students.view">
              <GuardianDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="attendance"
          element={
            <RequireModule module="attendance">
              <RequirePermission permission="attendance.view">
                <AttendancePage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="attendance/scan"
          element={
            <RequireModule module="attendance">
              <RequireAnyPermission permissions={["attendance.mark", "staff_attendance.mark"]}>
                <ScanAttendancePage />
              </RequireAnyPermission>
            </RequireModule>
          }
        />
        <Route
          path="fees"
          element={
            <RequireModule module="fees">
              <RequirePermission permission="fees.view">
                <FeesPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="exams"
          element={
            <RequireModule module="exams">
              <RequirePermission permission="exams.view">
                <ExamsPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="timetable"
          element={
            <RequireModule module="timetable">
              <RequirePermission permission="timetable.view">
                <TimetablePage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="library"
          element={
            <RequireModule module="library">
              <RequirePermission permission="library.view">
                <LibraryPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="transport"
          element={
            <RequireModule module="transport">
              <RequirePermission permission="transport.view">
                <TransportPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="houses"
          element={
            <RequireModule module="houses">
              <RequirePermission permission="houses.view">
                <HousesPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="id-cards"
          element={
            <RequireModule module="id_cards">
              <IdCardsPage />
            </RequireModule>
          }
        />
        <Route
          path="academic-setup"
          element={
            <RequirePermission permission="academic_setup.view">
              <AcademicSetupPage />
            </RequirePermission>
          }
        />
        <Route
          path="staff"
          element={
            <RequirePermission permission="staff.view">
              <StaffListPage />
            </RequirePermission>
          }
        />
        <Route
          path="staff/:id"
          element={
            <RequirePermission permission="staff.view">
              <StaffDetailPage />
            </RequirePermission>
          }
        />
        <Route path="my-leave" element={<MyLeavePage />} />
        <Route
          path="admin/leave-requests"
          element={
            <RequirePermission permission="staff_leave.manage">
              <LeaveRequestsPage />
            </RequirePermission>
          }
        />
        <Route
          path="payroll"
          element={
            <RequireModule module="payroll">
              <RequirePermission permission="payroll.view">
                <PayrollPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="expenses"
          element={
            <RequireModule module="expenses">
              <RequirePermission permission="expenses.view">
                <ExpensesPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="payroll/:runId"
          element={
            <RequireModule module="payroll">
              <RequirePermission permission="payroll.view">
                <PayrollRunDetailPage />
              </RequirePermission>
            </RequireModule>
          }
        />
        <Route
          path="admin/master-data"
          element={
            <RequirePermission permission="master_data.view">
              <MasterDataPage />
            </RequirePermission>
          }
        />
        <Route
          path="admin/roles"
          element={
            <RequirePermission permission="roles.manage">
              <RolesPage />
            </RequirePermission>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequirePermission permission="users.manage">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="admin/audit-log"
          element={
            <RequirePermission permission="audit.view">
              <AuditLogPage />
            </RequirePermission>
          }
        />
        <Route
          path="reports"
          element={
            <RequireAnyPermission
              permissions={[
                "students.view",
                "staff.view",
                "payroll.view",
                "fees.view",
                "attendance.view",
                "staff_attendance.view",
              ]}
            >
              <ReportsPage />
            </RequireAnyPermission>
          }
        />
      </Route>
    </Routes>
  );
}
