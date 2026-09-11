import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAppStore } from "@/stores/app-store";
import { AppShell } from "@/components/app-shell";
import { LoginPage } from "@/routes/login";
import { DashboardPage } from "@/routes/dashboard";
import { StudentListPage } from "@/routes/students/student-list";
import { StudentDetailPage } from "@/routes/students/student-detail";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useAppStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
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
      </Route>
    </Routes>
  );
}
