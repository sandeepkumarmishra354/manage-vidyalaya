import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAppStore } from "@/stores/app-store";
import type { ModuleKey } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { LoginPage } from "@/routes/login";
import { DashboardPage } from "@/routes/dashboard";
import { StudentListPage } from "@/routes/students/student-list";
import { StudentDetailPage } from "@/routes/students/student-detail";
import { AttendancePage } from "@/routes/attendance/attendance-page";
import { FeesPage } from "@/routes/fees/fees-page";
import { ExamsPage } from "@/routes/exams/exams-page";
import { AcademicSetupPage } from "@/routes/academic/academic-setup-page";
import { HousesPage } from "@/routes/houses/houses-page";
import { LibraryPage } from "@/routes/library/library-page";
import { TransportPage } from "@/routes/transport/transport-page";
import { ModuleSettingsPage } from "@/routes/settings/module-settings-page";
import { IdCardsPage } from "@/routes/id-cards/id-cards-page";

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
        <Route path="students" element={<StudentListPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route
          path="attendance"
          element={
            <RequireModule module="attendance">
              <AttendancePage />
            </RequireModule>
          }
        />
        <Route
          path="fees"
          element={
            <RequireModule module="fees">
              <FeesPage />
            </RequireModule>
          }
        />
        <Route
          path="exams"
          element={
            <RequireModule module="exams">
              <ExamsPage />
            </RequireModule>
          }
        />
        <Route
          path="library"
          element={
            <RequireModule module="library">
              <LibraryPage />
            </RequireModule>
          }
        />
        <Route
          path="transport"
          element={
            <RequireModule module="transport">
              <TransportPage />
            </RequireModule>
          }
        />
        <Route
          path="houses"
          element={
            <RequireModule module="houses">
              <HousesPage />
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
        <Route path="academic-setup" element={<AcademicSetupPage />} />
        <Route path="settings/modules" element={<ModuleSettingsPage />} />
      </Route>
    </Routes>
  );
}
