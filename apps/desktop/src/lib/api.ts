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

// ============================================================================
// Attendance
// ============================================================================

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "leave";

export interface AttendanceRosterEntry {
  student_id: string;
  first_name: string;
  last_name?: string | null;
  status?: AttendanceStatus | null;
  remarks?: string | null;
}

export interface MarkAttendanceInput {
  branch_id: string;
  class_id: string;
  section_id?: string | null;
  attendance_date: string;
  entries: { student_id: string; status: AttendanceStatus; remarks?: string | null }[];
}

export interface AttendanceHistoryEntry {
  attendance_date: string;
  status: AttendanceStatus;
  remarks?: string | null;
}

// ============================================================================
// Fees & Billing
// ============================================================================

export type FeeFrequency = "one_time" | "monthly" | "quarterly" | "annual";
export type InvoiceStatus = "pending" | "partial" | "paid" | "overdue" | "waived";
export type PaymentMethod = "cash" | "cheque" | "upi" | "card" | "online" | "bank_transfer";

export interface FeeStructure {
  id: string;
  branch_id: string;
  academic_session_id: string;
  class_id?: string | null;
  name: string;
  /** minor units (paise) */
  amount: number;
  frequency: FeeFrequency;
}

export interface NewFeeStructureInput {
  branch_id: string;
  academic_session_id: string;
  class_id?: string | null;
  name: string;
  amount: number;
  frequency: FeeFrequency;
}

export interface FeeInvoiceListItem {
  id: string;
  student_id: string;
  student_name: string;
  fee_structure_name: string;
  amount_due: number;
  amount_paid: number;
  due_date?: string | null;
  status: InvoiceStatus;
}

export interface FeePayment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  receipt_number?: string | null;
}

export interface RecordPaymentInput {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  receipt_number?: string | null;
  remarks?: string | null;
}

export interface StudentFeeSummary {
  invoices: FeeInvoiceListItem[];
  payments: FeePayment[];
  total_due: number;
  total_paid: number;
}

// ============================================================================
// Exams & Report Cards
// ============================================================================

export interface Subject {
  id: string;
  branch_id: string;
  name: string;
  code?: string | null;
}

export interface NewSubjectInput {
  branch_id: string;
  name: string;
  code?: string | null;
}

export interface Exam {
  id: string;
  branch_id: string;
  academic_session_id: string;
  class_id: string;
  name: string;
  exam_date?: string | null;
}

export interface NewExamInput {
  branch_id: string;
  academic_session_id: string;
  class_id: string;
  name: string;
  exam_date?: string | null;
}

export interface MarksRosterEntry {
  student_id: string;
  first_name: string;
  last_name?: string | null;
  max_marks: number;
  marks_obtained?: number | null;
  is_absent: boolean;
}

export interface SaveMarksInput {
  exam_id: string;
  subject_id: string;
  entries: {
    student_id: string;
    max_marks: number;
    marks_obtained?: number | null;
    is_absent: boolean;
  }[];
}

export interface ReportCardSubjectRow {
  subject_name: string;
  max_marks: number;
  marks_obtained?: number | null;
  is_absent: boolean;
}

export interface ReportCard {
  student_id: string;
  student_name: string;
  exam_name: string;
  rows: ReportCardSubjectRow[];
  total_obtained: number;
  total_max: number;
  percentage: number;
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
  listStudentsInClass: (classId: string) =>
    invoke<StudentListItem[]>("list_students_in_class", { classId }),
  getStudent: (id: string) => invoke<StudentDetail>("get_student", { id }),
  createAdmission: (input: NewAdmissionInput) =>
    invoke<Admission>("create_admission", { input }),

  getAttendanceRoster: (
    branchId: string,
    classId: string,
    sectionId: string | null | undefined,
    attendanceDate: string,
  ) =>
    invoke<AttendanceRosterEntry[]>("get_attendance_roster", {
      branchId,
      classId,
      sectionId,
      attendanceDate,
    }),
  markAttendance: (input: MarkAttendanceInput) => invoke<void>("mark_attendance", { input }),
  getStudentAttendanceHistory: (studentId: string) =>
    invoke<AttendanceHistoryEntry[]>("get_student_attendance_history", { studentId }),

  createFeeStructure: (input: NewFeeStructureInput) =>
    invoke<FeeStructure>("create_fee_structure", { input }),
  listFeeStructures: (branchId: string) => invoke<FeeStructure[]>("list_fee_structures", { branchId }),
  generateInvoices: (feeStructureId: string) =>
    invoke<number>("generate_invoices", { feeStructureId }),
  listInvoices: (branchId: string, status?: InvoiceStatus | null) =>
    invoke<FeeInvoiceListItem[]>("list_invoices", { branchId, status }),
  getStudentFeeSummary: (studentId: string) =>
    invoke<StudentFeeSummary>("get_student_fee_summary", { studentId }),
  recordPayment: (input: RecordPaymentInput) => invoke<FeePayment>("record_payment", { input }),

  createSubject: (input: NewSubjectInput) => invoke<Subject>("create_subject", { input }),
  listSubjects: (branchId: string) => invoke<Subject[]>("list_subjects", { branchId }),
  createExam: (input: NewExamInput) => invoke<Exam>("create_exam", { input }),
  listExams: (branchId: string, classId?: string | null) =>
    invoke<Exam[]>("list_exams", { branchId, classId }),
  getMarksRoster: (examId: string, subjectId: string) =>
    invoke<MarksRosterEntry[]>("get_marks_roster", { examId, subjectId }),
  saveMarks: (input: SaveMarksInput) => invoke<void>("save_marks", { input }),
  getReportCard: (studentId: string, examId: string) =>
    invoke<ReportCard>("get_report_card", { studentId, examId }),

  syncNow: () => invoke<SyncStatus>("sync_now"),
  getSyncStatus: () => invoke<SyncStatus>("get_sync_status"),
};
