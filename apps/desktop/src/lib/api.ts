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

export interface NewClassInput {
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

export interface NewSectionInput {
  class_id: string;
  name: string;
}

export interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface NewAcademicSessionInput {
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
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

export interface ConfirmAdmissionResult {
  admission_id: string;
  student_id: string;
  admission_number: string;
  stage: string;
}

// ============================================================================
// Module settings
// ============================================================================

export type ModuleKey = "attendance" | "fees" | "exams" | "library" | "transport" | "houses" | "id_cards";

export interface ModuleSetting {
  module_key: ModuleKey;
  is_enabled: boolean;
}

// ============================================================================
// Houses
// ============================================================================

export interface House {
  id: string;
  branch_id: string;
  name: string;
  color?: string | null;
}

export interface NewHouseInput {
  branch_id: string;
  name: string;
  color?: string | null;
}

export interface NewHousePointEventInput {
  branch_id: string;
  house_id: string;
  student_id?: string | null;
  academic_session_id?: string | null;
  points: number;
  reason: string;
  event_date: string;
}

export interface HousePointEventListItem {
  id: string;
  house_name: string;
  student_name?: string | null;
  points: number;
  reason: string;
  event_date: string;
}

export interface HouseLeaderboardRow {
  house_id: string;
  house_name: string;
  color?: string | null;
  total_points: number;
  student_count: number;
}

// ============================================================================
// Library
// ============================================================================

export interface LibraryBook {
  id: string;
  branch_id: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  category?: string | null;
  total_copies: number;
  available_copies: number;
}

export interface NewLibraryBookInput {
  branch_id: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  category?: string | null;
  total_copies: number;
}

export interface LibraryIssueListItem {
  id: string;
  book_id: string;
  book_title: string;
  student_id: string;
  student_name: string;
  issued_date: string;
  due_date: string;
  returned_date?: string | null;
  status: "issued" | "returned" | "lost";
}

// ============================================================================
// Transport
// ============================================================================

export interface TransportRoute {
  id: string;
  branch_id: string;
  name: string;
  vehicle_number?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  capacity?: number | null;
}

export interface NewTransportRouteInput {
  branch_id: string;
  name: string;
  vehicle_number?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  capacity?: number | null;
}

export interface TransportStop {
  id: string;
  route_id: string;
  name: string;
  sequence: number;
  pickup_time?: string | null;
}

export interface NewTransportStopInput {
  route_id: string;
  name: string;
  sequence: number;
  pickup_time?: string | null;
}

export interface StudentTransportInfo {
  route_name: string;
  stop_name: string;
  pickup_time?: string | null;
}

export interface TransportRosterEntry {
  student_id: string;
  first_name: string;
  last_name?: string | null;
  stop_name: string;
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

// ============================================================================
// Dashboard
// ============================================================================

export interface ClassCount {
  class_name: string;
  count: number;
}

export interface AttendanceTrendPoint {
  attendance_date: string;
  present_count: number;
  total_count: number;
}

export interface FeeStatusCount {
  status: InvoiceStatus;
  count: number;
  /** minor units (paise) */
  amount: number;
}

export interface DashboardStats {
  total_students: number;
  enrolled_count: number;
  applied_count: number;
  alumni_count: number;
  todays_attendance_present: number;
  todays_attendance_total: number;
  fee_collected_paise: number;
  fee_pending_paise: number;
  overdue_books_count: number;
  enrollment_by_class: ClassCount[];
  attendance_trend: AttendanceTrendPoint[];
  fee_status_breakdown: FeeStatusCount[];
}

export const api = {
  login: (email: string, password: string) =>
    invoke<Session>("login", { email, password }),
  getSession: () => invoke<Session | null>("get_session"),
  logout: () => invoke<void>("logout"),

  listBranches: () => invoke<Branch[]>("list_branches"),
  listClasses: (branchId: string) => invoke<SchoolClass[]>("list_classes", { branchId }),
  createClass: (input: NewClassInput) => invoke<SchoolClass>("create_class", { input }),
  listSections: (classId: string) => invoke<Section[]>("list_sections", { classId }),
  createSection: (input: NewSectionInput) => invoke<Section>("create_section", { input }),
  listAcademicSessions: () => invoke<AcademicSession[]>("list_academic_sessions"),
  createAcademicSession: (input: NewAcademicSessionInput) =>
    invoke<AcademicSession>("create_academic_session", { input }),
  currentAcademicSessionId: () => invoke<string | null>("current_academic_session_id"),

  listStudents: (branchId: string, search?: string) =>
    invoke<StudentListItem[]>("list_students", { branchId, search }),
  listStudentsInClass: (classId: string) =>
    invoke<StudentListItem[]>("list_students_in_class", { classId }),
  getStudent: (id: string) => invoke<StudentDetail>("get_student", { id }),
  createAdmission: (input: NewAdmissionInput) =>
    invoke<Admission>("create_admission", { input }),
  getAdmissionForStudent: (studentId: string) =>
    invoke<Admission | null>("get_admission_for_student", { studentId }),
  confirmAdmission: (admissionId: string) =>
    invoke<ConfirmAdmissionResult>("confirm_admission", { admissionId }),

  getModuleSettings: (branchId: string) => invoke<ModuleSetting[]>("get_module_settings", { branchId }),
  setModuleEnabled: (branchId: string, moduleKey: ModuleKey, isEnabled: boolean) =>
    invoke<ModuleSetting>("set_module_enabled", {
      input: { branch_id: branchId, module_key: moduleKey, is_enabled: isEnabled },
    }),

  createHouse: (input: NewHouseInput) => invoke<House>("create_house", { input }),
  listHouses: (branchId: string) => invoke<House[]>("list_houses", { branchId }),
  assignStudentHouse: (studentId: string, houseId: string) =>
    invoke<void>("assign_student_house", { input: { student_id: studentId, house_id: houseId } }),
  getStudentHouse: (studentId: string) => invoke<House | null>("get_student_house", { studentId }),
  awardHousePoints: (input: NewHousePointEventInput) => invoke<void>("award_house_points", { input }),
  listHousePointEvents: (branchId: string) =>
    invoke<HousePointEventListItem[]>("list_house_point_events", { branchId }),
  getHouseLeaderboard: (branchId: string, academicSessionId?: string | null) =>
    invoke<HouseLeaderboardRow[]>("get_house_leaderboard", { branchId, academicSessionId }),

  createBook: (input: NewLibraryBookInput) => invoke<LibraryBook>("create_book", { input }),
  listBooks: (branchId: string, search?: string) => invoke<LibraryBook[]>("list_books", { branchId, search }),
  issueBook: (bookId: string, studentId: string, dueDate: string) =>
    invoke<void>("issue_book", { input: { book_id: bookId, student_id: studentId, due_date: dueDate } }),
  returnBook: (issueId: string) => invoke<void>("return_book", { issueId }),
  listIssues: (branchId: string, status?: string | null) =>
    invoke<LibraryIssueListItem[]>("list_issues", { branchId, status }),

  createRoute: (input: NewTransportRouteInput) => invoke<TransportRoute>("create_route", { input }),
  listRoutes: (branchId: string) => invoke<TransportRoute[]>("list_routes", { branchId }),
  createStop: (input: NewTransportStopInput) => invoke<TransportStop>("create_stop", { input }),
  listStops: (routeId: string) => invoke<TransportStop[]>("list_stops", { routeId }),
  assignStudentTransport: (studentId: string, routeId: string, stopId: string) =>
    invoke<void>("assign_student_transport", {
      input: { student_id: studentId, route_id: routeId, stop_id: stopId },
    }),
  getStudentTransport: (studentId: string) =>
    invoke<StudentTransportInfo | null>("get_student_transport", { studentId }),
  listRouteRoster: (routeId: string) => invoke<TransportRosterEntry[]>("list_route_roster", { routeId }),

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

  getDashboardStats: (branchId: string) => invoke<DashboardStats>("get_dashboard_stats", { branchId }),

  syncNow: () => invoke<SyncStatus>("sync_now"),
  getSyncStatus: () => invoke<SyncStatus>("get_sync_status"),
};
