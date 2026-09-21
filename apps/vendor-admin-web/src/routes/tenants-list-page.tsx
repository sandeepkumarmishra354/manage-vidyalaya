import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type TenantWithUsage, type UsageMetric } from "../lib/api";
import { formatDate, planBadgeClass } from "../lib/format";
import { ApiError } from "../lib/http";

function UsageCell({ metric }: { metric: UsageMetric }) {
  const over = metric.count > metric.limit;
  return (
    <td className={over ? "usage-cell over" : "usage-cell"}>
      {metric.count}/{metric.limit}
    </td>
  );
}

export function TenantsListPage() {
  const [tenants, setTenants] = useState<TenantWithUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTenants()
      .then(setTenants)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tenants."));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Tenants</h2>
        <Link className="btn btn-primary" to="/tenants/new">
          + New tenant
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!tenants && !error && <p className="hint">Loading...</p>}

      {tenants && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Subdomain</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Expiry</th>
                <th>Branches</th>
                <th>Super admins</th>
                <th>Branch admins</th>
                <th>Students</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tenants/${t.id}`}>{t.name}</Link>
                  </td>
                  <td>{t.subdomain ?? "—"}</td>
                  <td>
                    <span className={planBadgeClass(t.plan_tier)}>{t.plan_tier}</span>
                  </td>
                  <td>
                    {t.is_suspended ? (
                      <span className="badge badge-suspended">suspended</span>
                    ) : (
                      t.subscription_status
                    )}
                  </td>
                  <td>{formatDate(t.plan_tier === "trial" ? t.trial_ends_at : t.subscription_expires_at)}</td>
                  <UsageCell metric={t.usage.branches} />
                  <UsageCell metric={t.usage.super_admins} />
                  <UsageCell metric={t.usage.branch_admins} />
                  <UsageCell metric={t.usage.students} />
                  <UsageCell metric={t.usage.staff} />
                </tr>
              ))}
            </tbody>
          </table>
          {tenants.length === 0 && <p className="hint">No tenants yet.</p>}
        </div>
      )}
    </div>
  );
}
