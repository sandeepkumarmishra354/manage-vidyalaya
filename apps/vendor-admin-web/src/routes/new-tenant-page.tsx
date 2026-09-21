import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type NewTenantInput, type NewTenantResult } from "../lib/api";
import { ApiError } from "../lib/http";
import { PLAN_TIERS, type PlanTier } from "../lib/plan-catalog";

const initialForm: NewTenantInput = {
  school_name: "",
  subdomain: "",
  branch_name: "Main Campus",
  branch_code: "MAIN",
  admin_name: "",
  admin_email: "",
  admin_password: "",
  plan_tier: "trial",
};

export function NewTenantPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<NewTenantInput>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewTenantResult | null>(null);

  function update<K extends keyof NewTenantInput>(key: K, value: NewTenantInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: NewTenantInput = { ...form };
      if (!payload.admin_password) delete payload.admin_password;
      const created = await api.createTenant(payload);
      setResult(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create tenant.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div>
        <div className="page-header">
          <h2>Tenant created</h2>
        </div>
        <div className="card" style={{ maxWidth: 480 }}>
          <p>
            <strong>{form.school_name}</strong> is provisioned on the <strong>{result.plan_tier}</strong> plan.
          </p>
          <p className="hint">Share these credentials with the school's admin (shown once, not recoverable later):</p>
          <div className="credentials-box">
            <div>Email: {result.admin_email}</div>
            <div>Password: {result.admin_password}</div>
            <div>Subdomain: {result.subdomain}</div>
          </div>
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.6rem" }}>
            <button className="btn btn-primary" onClick={() => navigate(`/tenants/${result.tenant_id}`)}>
              View tenant
            </button>
            <button
              className="btn"
              onClick={() => {
                setResult(null);
                setForm(initialForm);
              }}
            >
              Create another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link className="back-link" to="/tenants">
        ← Back to tenants
      </Link>
      <div className="page-header">
        <h2>New tenant</h2>
      </div>

      <div className="card">
        <form className="form" onSubmit={handleSubmit}>
          {error && <div className="error-banner">{error}</div>}

          <div className="field">
            <label htmlFor="school_name">School name</label>
            <input
              id="school_name"
              required
              value={form.school_name}
              onChange={(e) => update("school_name", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="subdomain">Subdomain</label>
            <input
              id="subdomain"
              required
              pattern="[a-z0-9-]+"
              placeholder="e.g. greenfield-high"
              value={form.subdomain}
              onChange={(e) => update("subdomain", e.target.value)}
            />
            <span className="hint">Lowercase letters, digits, and hyphens only.</span>
          </div>

          <div className="field">
            <label htmlFor="branch_name">First branch name</label>
            <input
              id="branch_name"
              required
              value={form.branch_name}
              onChange={(e) => update("branch_name", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="branch_code">First branch code</label>
            <input
              id="branch_code"
              required
              value={form.branch_code}
              onChange={(e) => update("branch_code", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="plan_tier">Plan tier</label>
            <select
              id="plan_tier"
              value={form.plan_tier}
              onChange={(e) => update("plan_tier", e.target.value as PlanTier)}
            >
              {PLAN_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="admin_name">Admin full name</label>
            <input
              id="admin_name"
              required
              value={form.admin_name}
              onChange={(e) => update("admin_name", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="admin_email">Admin email</label>
            <input
              id="admin_email"
              type="email"
              required
              value={form.admin_email}
              onChange={(e) => update("admin_email", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="admin_password">Admin password (optional)</label>
            <input
              id="admin_password"
              type="text"
              placeholder="Leave blank to auto-generate"
              value={form.admin_password}
              onChange={(e) => update("admin_password", e.target.value)}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create tenant"}
          </button>
        </form>
      </div>
    </div>
  );
}
