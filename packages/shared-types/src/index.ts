// Types shared between the Tauri desktop app and the cloud-api backend.
// Mirrors packages/db-schema/migrations — keep in sync when the schema changes.

export type UUID = string;
export type ISODateTime = string;

export interface SyncedEntity {
  id: UUID;
  tenant_id: UUID;
  updated_at: ISODateTime;
  updated_by?: UUID | null;
  deleted_at?: ISODateTime | null;
  version: number;
}

export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled";

export interface Tenant {
  id: UUID;
  name: string;
  subdomain?: string | null;
  subscription_status: SubscriptionStatus;
  subscription_expires_at?: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Branch extends SyncedEntity {
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  is_active: boolean;
}

export type RoleName =
  | "super_admin"
  | "branch_admin"
  | "accountant"
  | "teacher"
  | "front_desk";

export interface Role {
  id: UUID;
  tenant_id: UUID;
  name: RoleName;
}

export interface User extends SyncedEntity {
  branch_id?: UUID | null;
  full_name: string;
  email: string;
  phone?: string | null;
  is_active: boolean;
  roles: RoleName[];
}

export interface AcademicSession extends SyncedEntity {
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface SchoolClass extends SyncedEntity {
  branch_id: UUID;
  academic_session_id: UUID;
  name: string;
  sort_order: number;
}

export interface Section extends SyncedEntity {
  class_id: UUID;
  name: string;
  class_teacher_id?: UUID | null;
  capacity?: number | null;
}

export type StudentStatus =
  | "enquiry"
  | "applied"
  | "enrolled"
  | "alumni"
  | "withdrawn";

export interface Student extends SyncedEntity {
  branch_id: UUID;
  admission_number?: string | null;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  photo_path?: string | null;
  current_class_id?: UUID | null;
  current_section_id?: UUID | null;
  status: StudentStatus;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  notes?: string | null;
}

export type GuardianRelation = "father" | "mother" | "guardian";

export interface Guardian extends SyncedEntity {
  full_name: string;
  relation?: GuardianRelation | null;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
}

export interface StudentGuardian {
  id: UUID;
  tenant_id: UUID;
  student_id: UUID;
  guardian_id: UUID;
  relation: GuardianRelation;
  is_primary_contact: boolean;
}

export type AdmissionStage =
  | "enquiry"
  | "applied"
  | "interview"
  | "enrolled"
  | "rejected"
  | "withdrawn";

export interface Admission extends SyncedEntity {
  branch_id: UUID;
  student_id: UUID;
  applied_class_id?: UUID | null;
  academic_session_id: UUID;
  stage: AdmissionStage;
  applied_at: ISODateTime;
  decided_at?: ISODateTime | null;
  decided_by?: UUID | null;
  remarks?: string | null;
}

// ============================================================================
// Sync protocol DTOs (cloud-api <-> desktop)
// ============================================================================

export interface SyncPushChange {
  entity_table: string;
  entity_id: UUID;
  op: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  client_ts: ISODateTime;
}

export interface SyncPushRequest {
  tenant_id: UUID;
  changes: SyncPushChange[];
}

export interface SyncPushResult {
  entity_table: string;
  entity_id: UUID;
  server_seq: number;
  accepted: boolean;
  conflict?: boolean;
}

export interface SyncPushResponse {
  results: SyncPushResult[];
}

export interface SyncPullRequest {
  tenant_id: UUID;
  since_server_seq: number;
  limit?: number;
}

export interface SyncPullChange {
  entity_table: string;
  entity_id: UUID;
  op: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  server_seq: number;
}

export interface SyncPullResponse {
  changes: SyncPullChange[];
  latest_server_seq: number;
  has_more: boolean;
}

// ============================================================================
// Auth DTOs
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface EntitlementClaims {
  tenant_id: UUID;
  branch_ids: UUID[] | "all";
  subscription_status: SubscriptionStatus;
  expires_at: ISODateTime;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  entitlement: EntitlementClaims;
}
