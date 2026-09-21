import { http, setToken } from "./http";
import type { PlanTier } from "./plan-catalog";

export interface VendorAdmin {
  sub: string;
  email: string;
}

export interface LoginResponse {
  access_token: string;
  admin: { id: string; email: string; full_name: string };
}

export interface UsageMetric {
  count: number;
  limit: number;
}

export interface TenantUsage {
  branches: UsageMetric;
  super_admins: UsageMetric;
  branch_admins: UsageMetric;
  students: UsageMetric;
  staff: UsageMetric;
}

export interface Tenant {
  id: string;
  name: string;
  subdomain: string | null;
  subscription_status: string;
  plan_tier: PlanTier;
  trial_ends_at: string | null;
  subscription_expires_at: string | null;
  is_suspended: boolean;
}

export interface TenantWithUsage extends Tenant {
  usage: TenantUsage;
}

export interface UpdateTenantInput {
  plan_tier?: PlanTier;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
  is_suspended?: boolean;
}

export interface NewTenantInput {
  school_name: string;
  subdomain: string;
  branch_name: string;
  branch_code: string;
  admin_name: string;
  admin_email: string;
  admin_password?: string;
  plan_tier?: PlanTier;
}

export interface NewTenantResult {
  tenant_id: string;
  subdomain: string;
  plan_tier: PlanTier;
  trial_ends_at: string | null;
  admin_email: string;
  admin_password: string;
}

export const api = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await http.post<LoginResponse>("/auth/login", { email, password });
    setToken(result.access_token);
    return result;
  },
  me: () => http.get<VendorAdmin>("/auth/me"),
  listTenants: () => http.get<TenantWithUsage[]>("/tenants"),
  getTenant: (id: string) => http.get<Tenant>(`/tenants/${id}`),
  updateTenant: (id: string, input: UpdateTenantInput) => http.patch<Tenant>(`/tenants/${id}`, input),
  createTenant: (input: NewTenantInput) => http.post<NewTenantResult>("/tenants", input),
};
