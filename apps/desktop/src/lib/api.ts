import { invoke } from "@tauri-apps/api/core";

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  city?: string | null;
  is_active: boolean;
}

export interface SchoolClass {
  id: string;
  branch_id: string;
  academic_session_id: string;
  name: string;
  sort_order: number;
}

export interface Section {
  id: string;
  class_id: string;
  name: string;
}

export type StudentStatus = "enquiry" | "applied" | "enrolled" | "alumni" | "withdrawn";

export interface StudentListItem {
  id: string;
  admission_number?: string | null;
  first_name: string;
  last_name?: string | null;
  status: StudentStatus;
  class_name?: string | null;
  section_name?: string | null;
}

export interface Guardian {
  id: string;
  full_name: string;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface StudentDetail {
  id: string;
  tenant_id: string;
  branch_id: string;
  admission_number?: string | null;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  current_class_id?: string | null;
  current_section_id?: string | null;
  status: StudentStatus;
  address?: string | null;
  updated_at: string;
  version: number;
  guardians: Guardian[];
}

export interface NewAdmissionInput {
  branch_id: string;
  academic_session_id: string;
  applied_class_id?: string | null;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  guardian_name: string;
  guardian_relation: string;
  guardian_phone?: string | null;
  guardian_email?: string | null;
}

export interface Admission {
  id: string;
  student_id: string;
  branch_id: string;
  stage: string;
  applied_at: string;
}

export interface Session {
  user_id: string;
  full_name: string;
  email: string;
  tenant_id: string;
  roles: string[];
  branch_ids: string[];
  entitlement_expires_at: string;
}

export interface SyncStatus {
  last_synced_at?: string | null;
  pending_count: number;
  is_online: boolean;
}

export const api = {
  login: (email: string, password: string) =>
    invoke<Session>("login", { email, password }),
  getSession: () => invoke<Session | null>("get_session"),
  logout: () => invoke<void>("logout"),

  listBranches: () => invoke<Branch[]>("list_branches"),
  listClasses: (branchId: string) => invoke<SchoolClass[]>("list_classes", { branchId }),
  listSections: (classId: string) => invoke<Section[]>("list_sections", { classId }),
  currentAcademicSessionId: () => invoke<string | null>("current_academic_session_id"),

  listStudents: (branchId: string, search?: string) =>
    invoke<StudentListItem[]>("list_students", { branchId, search }),
  getStudent: (id: string) => invoke<StudentDetail>("get_student", { id }),
  createAdmission: (input: NewAdmissionInput) =>
    invoke<Admission>("create_admission", { input }),

  syncNow: () => invoke<SyncStatus>("sync_now"),
  getSyncStatus: () => invoke<SyncStatus>("get_sync_status"),
};
