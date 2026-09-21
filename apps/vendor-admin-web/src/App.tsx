import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";

import { LoginPage } from "./routes/login-page";
import { NewTenantPage } from "./routes/new-tenant-page";
import { TenantDetailPage } from "./routes/tenant-detail-page";
import { TenantsListPage } from "./routes/tenants-list-page";
import { useAuth } from "./lib/use-auth";

function Shell() {
  const { state, refresh, logout } = useAuth();

  if (state.status === "loading") {
    return <p className="hint" style={{ padding: "1.5rem" }}>Loading...</p>;
  }

  if (state.status === "signed-out") {
    return <LoginPage onSignedIn={() => void refresh()} />;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Vidyalaya Vendor Admin</h1>
        <div className="topbar-actions">
          <span>{state.admin.email}</span>
          <button className="btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
      <div className="main">
        <Routes>
          <Route path="/tenants" element={<TenantsListPage />} />
          <Route path="/tenants/new" element={<NewTenantPage />} />
          <Route path="/tenants/:id" element={<TenantDetailPage />} />
          <Route path="*" element={<Navigate to="/tenants" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
