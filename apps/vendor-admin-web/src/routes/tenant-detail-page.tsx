import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { api, type Tenant, type UpdateTenantInput } from "../lib/api";
import { PLAN_TIERS, type PlanTier } from "../lib/plan-catalog";
import { ApiError } from "../lib/http";

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [planTier, setPlanTier] = useState<PlanTier>("trial");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState("");
  const [isSuspended, setIsSuspended] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getTenant(id)
      .then((t) => {
        setTenant(t);
        setPlanTier(t.plan_tier);
        setTrialEndsAt(toDateInputValue(t.trial_ends_at));
        setSubscriptionExpiresAt(toDateInputValue(t.subscription_expires_at));
        setIsSuspended(t.is_suspended);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load tenant."));
  }, [id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const input: UpdateTenantInput = {
      plan_tier: planTier,
      trial_ends_at: trialEndsAt || null,
      subscription_expires_at: subscriptionExpiresAt || null,
      is_suspended: isSuspended,
    };
    try {
      const updated = await api.updateTenant(id, input);
      setTenant(updated);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <Link className="back-link" to="/tenants">
          ← Back to tenants
        </Link>
        <div className="error-banner">{loadError}</div>
      </div>
    );
  }

  if (!tenant) {
    return <p className="hint">Loading...</p>;
  }

  return (
    <div>
      <Link className="back-link" to="/tenants">
        ← Back to tenants
      </Link>
      <div className="page-header">
        <h2>{tenant.name}</h2>
      </div>

      <div className="card">
        <form className="form" onSubmit={handleSubmit}>
          {saveError && <div className="error-banner">{saveError}</div>}

          <div className="field">
            <label>Subdomain</label>
            <div>{tenant.subdomain ?? "—"}</div>
          </div>

          <div className="field">
            <label htmlFor="plan_tier">Plan tier</label>
            <select id="plan_tier" value={planTier} onChange={(e) => setPlanTier(e.target.value as PlanTier)}>
              {PLAN_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="trial_ends_at">Trial ends</label>
            <input
              id="trial_ends_at"
              type="date"
              value={trialEndsAt}
              onChange={(e) => setTrialEndsAt(e.target.value)}
            />
            <span className="hint">Only relevant while plan tier is "trial".</span>
          </div>

          <div className="field">
            <label htmlFor="subscription_expires_at">Subscription expiry</label>
            <input
              id="subscription_expires_at"
              type="date"
              value={subscriptionExpiresAt}
              onChange={(e) => setSubscriptionExpiresAt(e.target.value)}
            />
            <span className="hint">Leave blank for open-ended (e.g. grandfathered tenants).</span>
          </div>

          <div className="field">
            <label>
              <input type="checkbox" checked={isSuspended} onChange={(e) => setIsSuspended(e.target.checked)} />{" "}
              Suspended
            </label>
            <span className="hint">Blocks all logins for this tenant immediately, regardless of expiry.</span>
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
          {saved && <span className="hint">Saved.</span>}
        </form>
      </div>
    </div>
  );
}
