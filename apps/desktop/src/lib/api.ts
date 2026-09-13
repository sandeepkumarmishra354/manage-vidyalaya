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
  capacity?: number | null;
  class_teacher_staff_id?: string | null;
}

export interface NewSectionInput {
  class_id: string;
  name: string;
  capacity?: number | null;
}

export interface UpdateClassInput {
  id: string;
  name: string;
  sort_order: number;
}

export interface UpdateSectionInput {
  id: string;
  name: string;
  capacity?: number | null;
}

export interface UpdateAcademicSessionInput {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
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

export interface UpdateStudentInput {
  id: string;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  current_class_id?: string | null;
  current_section_id?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  notes?: string | null;
}

export interface UpdateGuardianInput {
  id: string;
  full_name: string;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
}

// ============================================================================
// Module settings
// ============================================================================

export type ModuleKey =
  | "attendance"
  | "fees"
  | "exams"
  | "library"
  | "transport"
  | "houses"
  | "id_cards"
  | "payroll";

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

export interface UpdateHouseInput {
  id: string;
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

export interface UpdateLibraryBookInput {
  id: string;
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

export interface UpdateTransportRouteInput {
  id: string;
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

export interface UpdateTransportStopInput {
  id: string;
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
export type InvoiceStatus = "pending" | "partial" | "paid" | "overdue" | "waived" | "voided";
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

export interface UpdateFeeStructureInput {
  id: string;
  name: string;
  amount: number;
  frequency: FeeFrequency;
}

export interface VoidInvoiceInput {
  invoice_id: string;
  reason: string;
}

export interface ReversePaymentInput {
  payment_id: string;
  reason: string;
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

export type ExamType = "regular" | "back_paper" | "supplementary" | "unit_test" | "term";

export interface Exam {
  id: string;
  branch_id: string;
  academic_session_id: string;
  class_id: string;
  name: string;
  exam_date?: string | null;
  exam_type: ExamType;
  parent_exam_id?: string | null;
  passing_percentage: number;
}

export interface NewExamInput {
  branch_id: string;
  academic_session_id: string;
  class_id: string;
  name: string;
  exam_date?: string | null;
  exam_type?: ExamType | null;
  parent_exam_id?: string | null;
  passing_percentage?: number | null;
}

export interface UpdateExamInput {
  id: string;
  name: string;
  exam_date?: string | null;
  passing_percentage: number;
}

export interface UpdateSubjectInput {
  id: string;
  name: string;
  code?: string | null;
}

export interface BackpaperCandidate {
  student_id: string;
  first_name: string;
  last_name?: string | null;
  marks_obtained?: number | null;
  max_marks: number;
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
  backpaper_marks_obtained?: number | null;
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
// RBAC: permissions, roles, users
// ============================================================================

export interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

export interface NewRoleInput {
  name: string;
}

export interface SetRolePermissionsInput {
  role_id: string;
  permission_keys: string[];
}

export interface UserSummary {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  role_ids: string[];
}

export interface CreateStaffLoginInput {
  staff_id: string;
  email: string;
  full_name: string;
  initial_password: string;
  branch_id?: string | null;
}

export interface ResetStaffPasswordInput {
  user_id: string;
  new_password: string;
}

// ============================================================================
// Staff / HR
// ============================================================================

export type StaffStatus = "active" | "inactive" | "on_leave" | "terminated";
export type EmploymentType = "full_time" | "part_time" | "contract";

export interface StaffListItem {
  id: string;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  designation: string;
  department?: string | null;
  status: StaffStatus;
  has_login: boolean;
}

export interface Staff {
  id: string;
  branch_id: string;
  user_id?: string | null;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  phone?: string | null;
  personal_email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  designation: string;
  department?: string | null;
  employment_type: EmploymentType;
  date_of_joining: string;
  date_of_leaving?: string | null;
  status: StaffStatus;
  qualification?: string | null;
  blood_group?: string | null;
  photo_path?: string | null;
  pan_number?: string | null;
  aadhaar_number?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  pf_number?: string | null;
  esi_number?: string | null;
  uan_number?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
}

export interface NewStaffInput {
  branch_id: string;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  phone?: string | null;
  personal_email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  designation: string;
  department?: string | null;
  employment_type: EmploymentType;
  date_of_joining: string;
  qualification?: string | null;
  blood_group?: string | null;
  pan_number?: string | null;
  aadhaar_number?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  pf_number?: string | null;
  esi_number?: string | null;
  uan_number?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
}

export interface UpdateStaffInput extends NewStaffInput {
  id: string;
}

export interface SetStaffStatusInput {
  staff_id: string;
  status: StaffStatus;
  date_of_leaving?: string | null;
}

export interface TeacherAssignment {
  id: string;
  staff_id: string;
  staff_name: string;
  class_id: string;
  class_name: string;
  section_id?: string | null;
  section_name?: string | null;
  subject_id: string;
  subject_name: string;
  academic_session_id: string;
}

export interface NewTeacherAssignmentInput {
  branch_id: string;
  staff_id: string;
  class_id: string;
  section_id?: string | null;
  subject_id: string;
  academic_session_id: string;
}

export interface SetClassTeacherInput {
  section_id: string;
  staff_id?: string | null;
}

// ============================================================================
// Staff attendance
// ============================================================================

export interface StaffAttendanceRosterEntry {
  staff_id: string;
  first_name: string;
  last_name?: string | null;
  designation: string;
  status?: AttendanceStatus | null;
  remarks?: string | null;
}

export interface MarkStaffAttendanceInput {
  branch_id: string;
  attendance_date: string;
  entries: { staff_id: string; status: AttendanceStatus; remarks?: string | null }[];
}

export interface StaffAttendanceHistoryEntry {
  attendance_date: string;
  status: AttendanceStatus;
  remarks?: string | null;
}

// ============================================================================
// Payroll
// ============================================================================

export interface SalaryComponent {
  id?: string | null;
  component_name: string;
  component_type: "earning" | "deduction";
  calculation_type: "fixed" | "percent_of_basic";
  amount?: number | null;
  percent?: number | null;
}

export interface SalaryStructure {
  id: string;
  staff_id: string;
  effective_from: string;
  /** minor units (paise) */
  basic_amount: number;
  components: SalaryComponent[];
}

export interface SetSalaryStructureInput {
  staff_id: string;
  branch_id: string;
  effective_from: string;
  basic_amount: number;
  components: SalaryComponent[];
}

export interface GeneratePayrollRunInput {
  branch_id: string;
  period_month: number;
  period_year: number;
}

export type PayrollRunStatus = "draft" | "finalized" | "paid";

export interface PayrollRun {
  id: string;
  branch_id: string;
  period_month: number;
  period_year: number;
  status: PayrollRunStatus;
  generated_at: string;
}

export interface PayslipLineItem {
  id: string;
  component_name: string;
  component_type: "earning" | "deduction";
  amount: number;
}

export interface Payslip {
  id: string;
  payroll_run_id: string;
  staff_id: string;
  staff_name: string;
  days_in_month: number;
  days_present: number;
  days_lop: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  status: PayrollRunStatus;
  paid_on?: string | null;
  line_items: PayslipLineItem[];
}

export interface PayrollRunDetail extends PayrollRun {
  payslips: Payslip[];
}

export interface AdjustPayslipLineItemInput {
  payslip_id: string;
  component_name: string;
  component_type: "earning" | "deduction";
  amount: number;
}

// ============================================================================
// Session promotion / rollover
// ============================================================================

export interface ClassMappingSuggestion {
  from_class_id: string;
  from_class_name: string;
  suggested_to_class_id?: string | null;
}

export interface CreatePromotionBatchInput {
  branch_id: string;
  from_session_id: string;
  to_session_id: string;
  class_mapping: Record<string, string>;
}

export type PromotionDecision = "promote" | "retain" | "withdraw";

export interface PromotionBatchItem {
  id: string;
  student_id: string;
  student_name: string;
  from_class_name?: string | null;
  to_class_id?: string | null;
  to_class_name?: string | null;
  to_section_id?: string | null;
  decision: PromotionDecision;
}

export interface PromotionBatch {
  id: string;
  branch_id: string;
  from_session_id: string;
  to_session_id: string;
  status: "draft" | "completed";
  items: PromotionBatchItem[];
}

export interface SetPromotionDecisionInput {
  batch_item_id: string;
  decision: PromotionDecision;
  to_class_id?: string | null;
  to_section_id?: string | null;
}

// ============================================================================
// Audit log
// ============================================================================

export interface AuditLogEntry {
  id: string;
  actor_name?: string | null;
  entity_table: string;
  entity_id: string;
  action: string;
  summary: string;
  created_at: string;
}

export interface AuditLogFilter {
  entity_table?: string | null;
  actor_user_id?: string | null;
  from_date?: string | null;
  to_date?: string | null;
  page?: number | null;
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
  updateAcademicSession: (input: UpdateAcademicSessionInput) =>
    invoke<void>("update_academic_session", { input }),
  currentAcademicSessionId: () => invoke<string | null>("current_academic_session_id"),
  updateClass: (input: UpdateClassInput) => invoke<void>("update_class", { input }),
  deleteClass: (id: string) => invoke<void>("delete_class", { id }),
  updateSection: (input: UpdateSectionInput) => invoke<void>("update_section", { input }),
  deleteSection: (id: string) => invoke<void>("delete_section", { id }),

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
  updateStudent: (input: UpdateStudentInput) => invoke<void>("update_student", { input }),
  deleteStudent: (id: string) => invoke<void>("delete_student", { id }),
  updateGuardian: (input: UpdateGuardianInput) => invoke<void>("update_guardian", { input }),

  getModuleSettings: (branchId: string) => invoke<ModuleSetting[]>("get_module_settings", { branchId }),
  setModuleEnabled: (branchId: string, moduleKey: ModuleKey, isEnabled: boolean) =>
    invoke<ModuleSetting>("set_module_enabled", {
      input: { branch_id: branchId, module_key: moduleKey, is_enabled: isEnabled },
    }),

  createHouse: (input: NewHouseInput) => invoke<House>("create_house", { input }),
  updateHouse: (input: UpdateHouseInput) => invoke<void>("update_house", { input }),
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
  updateBook: (input: UpdateLibraryBookInput) => invoke<void>("update_book", { input }),
  listBooks: (branchId: string, search?: string) => invoke<LibraryBook[]>("list_books", { branchId, search }),
  issueBook: (bookId: string, studentId: string, dueDate: string) =>
    invoke<void>("issue_book", { input: { book_id: bookId, student_id: studentId, due_date: dueDate } }),
  returnBook: (issueId: string) => invoke<void>("return_book", { issueId }),
  listIssues: (branchId: string, status?: string | null) =>
    invoke<LibraryIssueListItem[]>("list_issues", { branchId, status }),

  createRoute: (input: NewTransportRouteInput) => invoke<TransportRoute>("create_route", { input }),
  updateRoute: (input: UpdateTransportRouteInput) => invoke<void>("update_route", { input }),
  listRoutes: (branchId: string) => invoke<TransportRoute[]>("list_routes", { branchId }),
  createStop: (input: NewTransportStopInput) => invoke<TransportStop>("create_stop", { input }),
  updateStop: (input: UpdateTransportStopInput) => invoke<void>("update_stop", { input }),
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
  updateFeeStructure: (input: UpdateFeeStructureInput) => invoke<void>("update_fee_structure", { input }),
  listFeeStructures: (branchId: string) => invoke<FeeStructure[]>("list_fee_structures", { branchId }),
  generateInvoices: (feeStructureId: string) =>
    invoke<number>("generate_invoices", { feeStructureId }),
  voidInvoice: (input: VoidInvoiceInput) => invoke<void>("void_invoice", { input }),
  listInvoices: (branchId: string, status?: InvoiceStatus | null) =>
    invoke<FeeInvoiceListItem[]>("list_invoices", { branchId, status }),
  getStudentFeeSummary: (studentId: string) =>
    invoke<StudentFeeSummary>("get_student_fee_summary", { studentId }),
  recordPayment: (input: RecordPaymentInput) => invoke<FeePayment>("record_payment", { input }),
  reversePayment: (input: ReversePaymentInput) => invoke<void>("reverse_payment", { input }),

  createSubject: (input: NewSubjectInput) => invoke<Subject>("create_subject", { input }),
  updateSubject: (input: UpdateSubjectInput) => invoke<void>("update_subject", { input }),
  listSubjects: (branchId: string) => invoke<Subject[]>("list_subjects", { branchId }),
  createExam: (input: NewExamInput) => invoke<Exam>("create_exam", { input }),
  updateExam: (input: UpdateExamInput) => invoke<void>("update_exam", { input }),
  listExams: (branchId: string, classId?: string | null) =>
    invoke<Exam[]>("list_exams", { branchId, classId }),
  listStudentsPendingBackpaper: (examId: string, subjectId: string) =>
    invoke<BackpaperCandidate[]>("list_students_pending_backpaper", { examId, subjectId }),
  getMarksRoster: (examId: string, subjectId: string) =>
    invoke<MarksRosterEntry[]>("get_marks_roster", { examId, subjectId }),
  saveMarks: (input: SaveMarksInput) => invoke<void>("save_marks", { input }),
  getReportCard: (studentId: string, examId: string) =>
    invoke<ReportCard>("get_report_card", { studentId, examId }),

  getDashboardStats: (branchId: string) => invoke<DashboardStats>("get_dashboard_stats", { branchId }),

  syncNow: () => invoke<SyncStatus>("sync_now"),
  getSyncStatus: () => invoke<SyncStatus>("get_sync_status"),

  // RBAC: permissions, roles, users
  listPermissionCatalog: () => invoke<string[]>("list_permission_catalog"),
  listMyPermissions: () => invoke<string[]>("list_my_permissions"),
  listRoles: () => invoke<Role[]>("list_roles"),
  createRole: (input: NewRoleInput) => invoke<Role>("create_role", { input }),
  updateRole: (id: string, name: string) => invoke<void>("update_role", { id, name }),
  deleteRole: (id: string) => invoke<void>("delete_role", { id }),
  listRolePermissions: (roleId: string) => invoke<string[]>("list_role_permissions", { roleId }),
  setRolePermissions: (input: SetRolePermissionsInput) => invoke<void>("set_role_permissions", { input }),
  listUsers: () => invoke<UserSummary[]>("list_users"),
  assignUserRole: (userId: string, roleId: string) => invoke<void>("assign_user_role", { userId, roleId }),
  removeUserRole: (userId: string, roleId: string) => invoke<void>("remove_user_role", { userId, roleId }),
  setUserActive: (userId: string, isActive: boolean) =>
    invoke<void>("set_user_active", { userId, isActive }),
  createStaffLogin: (input: CreateStaffLoginInput) => invoke<string>("create_staff_login", { input }),
  resetStaffPassword: (input: ResetStaffPasswordInput) => invoke<void>("reset_staff_password", { input }),

  // Staff / HR
  listStaff: (branchId: string, search?: string) =>
    invoke<StaffListItem[]>("list_staff", { branchId, search }),
  getStaff: (id: string) => invoke<Staff>("get_staff", { id }),
  createStaff: (input: NewStaffInput) => invoke<Staff>("create_staff", { input }),
  updateStaff: (input: UpdateStaffInput) => invoke<void>("update_staff", { input }),
  setStaffStatus: (input: SetStaffStatusInput) => invoke<void>("set_staff_status", { input }),
  listTeacherAssignments: (branchId: string, staffId?: string | null) =>
    invoke<TeacherAssignment[]>("list_teacher_assignments", { branchId, staffId }),
  createTeacherAssignment: (input: NewTeacherAssignmentInput) =>
    invoke<void>("create_teacher_assignment", { input }),
  deleteTeacherAssignment: (id: string) => invoke<void>("delete_teacher_assignment", { id }),
  setClassTeacher: (input: SetClassTeacherInput) => invoke<void>("set_class_teacher", { input }),

  // Staff attendance
  getStaffAttendanceRoster: (branchId: string, attendanceDate: string) =>
    invoke<StaffAttendanceRosterEntry[]>("get_staff_attendance_roster", { branchId, attendanceDate }),
  markStaffAttendance: (input: MarkStaffAttendanceInput) => invoke<void>("mark_staff_attendance", { input }),
  getStaffAttendanceHistory: (staffId: string) =>
    invoke<StaffAttendanceHistoryEntry[]>("get_staff_attendance_history", { staffId }),

  // Payroll
  getSalaryStructure: (staffId: string) => invoke<SalaryStructure | null>("get_salary_structure", { staffId }),
  setSalaryStructure: (input: SetSalaryStructureInput) => invoke<void>("set_salary_structure", { input }),
  generatePayrollRun: (input: GeneratePayrollRunInput) =>
    invoke<PayrollRunDetail>("generate_payroll_run", { input }),
  listPayrollRuns: (branchId: string) => invoke<PayrollRun[]>("list_payroll_runs", { branchId }),
  getPayrollRun: (runId: string) => invoke<PayrollRunDetail>("get_payroll_run", { runId }),
  finalizePayrollRun: (runId: string) => invoke<void>("finalize_payroll_run", { runId }),
  markPayslipPaid: (payslipId: string, paidOn: string) =>
    invoke<void>("mark_payslip_paid", { payslipId, paidOn }),
  adjustPayslipLineItem: (input: AdjustPayslipLineItemInput) =>
    invoke<void>("adjust_payslip_line_item", { input }),

  // Session promotion / rollover
  suggestClassMapping: (branchId: string, fromSessionId: string, toSessionId: string) =>
    invoke<ClassMappingSuggestion[]>("suggest_class_mapping", { branchId, fromSessionId, toSessionId }),
  createPromotionBatch: (input: CreatePromotionBatchInput) =>
    invoke<PromotionBatch>("create_promotion_batch", { input }),
  getPromotionBatch: (batchId: string) => invoke<PromotionBatch>("get_promotion_batch", { batchId }),
  setPromotionDecision: (input: SetPromotionDecisionInput) =>
    invoke<void>("set_promotion_decision", { input }),
  executePromotionBatch: (batchId: string) => invoke<void>("execute_promotion_batch", { batchId }),

  // Audit log
  listAuditLog: (filter: AuditLogFilter) => invoke<AuditLogEntry[]>("list_audit_log", { filter }),
};
