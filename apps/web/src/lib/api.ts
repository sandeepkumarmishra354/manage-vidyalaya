import { http } from "@/lib/http";

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  signature_url?: string | null;
  print_template: string;
  print_paper_color: string;
  is_active: boolean;
}

export interface UpdateBranchInput {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  signature_url?: string | null;
  print_template?: string;
  print_paper_color?: string;
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

// "holiday" = no attendance/payroll impact. "half_day" = counts as half a
// working day for everyone (school-wide) -- distinct from a staff member's
// own attendance status of the same name.
export type DayType = "holiday" | "half_day" | "working";

export interface CalendarHoliday {
  id: string;
  date: string;
  name: string;
  type: "holiday" | "half_day";
}

export interface SchoolCalendarData {
  id: string | null;
  branch_id: string;
  academic_session_id: string;
  weekly_off_days: number[];
  weekly_half_days: number[];
  holidays: CalendarHoliday[];
}

export interface SetWeeklyRuleInput {
  branch_id: string;
  academic_session_id: string;
  weekly_off_days: number[];
  weekly_half_days: number[];
}

export interface CreateHolidayInput {
  branch_id: string;
  academic_session_id: string;
  date: string;
  name: string;
  type: "holiday" | "half_day";
}

export interface UpdateHolidayInput {
  date: string;
  name: string;
  type: "holiday" | "half_day";
}

export type StudentStatus = "enquiry" | "applied" | "enrolled" | "alumni" | "withdrawn";

export interface StudentListItem {
  id: string;
  admission_number?: string | null;
  roll_number?: string | null;
  first_name: string;
  last_name?: string | null;
  status: StudentStatus;
  class_name?: string | null;
  section_name?: string | null;
  graduation_year?: number | null;
  higher_education?: string | null;
  current_occupation?: string | null;
}

export interface ListStudentsFilters {
  search?: string;
  status?: StudentStatus;
  class_id?: string;
  section_id?: string;
  gender?: string;
}

export interface Guardian {
  id: string;
  full_name: string;
  relation?: string | null;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  aadhaar_number?: string | null;
  /** rupees, NOT paise -- informational/eligibility field. */
  annual_income?: number | null;
}

export interface StudentGuardianLink extends Guardian {
  is_primary_contact: boolean;
}

export interface GuardianSearchResult extends Guardian {
  linked_students: { id: string; name: string; class_name?: string | null }[];
}

export interface GuardianChild {
  id: string;
  first_name: string;
  last_name?: string | null;
  admission_number?: string | null;
  class_name?: string | null;
  section_name?: string | null;
  status: string;
}

export interface GuardianDetail extends Guardian {
  children: GuardianChild[];
}

export interface Sibling {
  id: string;
  first_name: string;
  last_name?: string | null;
  admission_number?: string | null;
  class_name?: string | null;
  section_name?: string | null;
}

export interface AddGuardianInput {
  guardian_id?: string | null;
  relation: string;
  is_primary_contact?: boolean;
  full_name?: string;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  aadhaar_number?: string | null;
  annual_income?: number | null;
}

export interface StudentDetail {
  id: string;
  tenant_id: string;
  branch_id: string;
  admission_number?: string | null;
  roll_number?: string | null;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  current_class_id?: string | null;
  current_section_id?: string | null;
  class_name?: string | null;
  section_name?: string | null;
  status: StudentStatus;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  notes?: string | null;
  category?: string | null;
  religion?: string | null;
  nationality?: string | null;
  mother_tongue?: string | null;
  aadhaar_number?: string | null;
  previous_school_name?: string | null;
  medical_notes?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  date_of_leaving?: string | null;
  reason_for_leaving?: string | null;
  tc_number?: string | null;
  tc_issue_date?: string | null;
  conduct_remark?: string | null;
  graduation_year?: number | null;
  higher_education?: string | null;
  current_occupation?: string | null;
  alumni_contact_email?: string | null;
  alumni_notes?: string | null;
  updated_at: string;
  version: number;
  guardians: StudentGuardianLink[];
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
  category?: string | null;
  religion?: string | null;
  nationality?: string | null;
  mother_tongue?: string | null;
  aadhaar_number?: string | null;
  previous_school_name?: string | null;
  medical_notes?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  guardian_id?: string | null;
  guardian_name?: string;
  guardian_relation: string;
  guardian_phone?: string | null;
  guardian_alt_phone?: string | null;
  guardian_email?: string | null;
  guardian_occupation?: string | null;
  guardian_address?: string | null;
  guardian_aadhaar_number?: string | null;
  guardian_annual_income?: number | null;
  // Which normally-matching fee structures to actually charge this family
  // for -- omit for "everything matches" (today's behavior); an explicit
  // list (even empty) excludes anything left unchecked.
  fee_structure_ids?: string[];
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
  roll_number?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  current_class_id?: string | null;
  current_section_id?: string | null;
  status?: StudentStatus;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  notes?: string | null;
  category?: string | null;
  religion?: string | null;
  nationality?: string | null;
  mother_tongue?: string | null;
  aadhaar_number?: string | null;
  previous_school_name?: string | null;
  medical_notes?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  graduation_year?: number | null;
  higher_education?: string | null;
  current_occupation?: string | null;
  alumni_contact_email?: string | null;
  alumni_notes?: string | null;
}

export interface UpdateGuardianInput {
  id: string;
  full_name: string;
  relation?: string | null;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  aadhaar_number?: string | null;
  annual_income?: number | null;
}

// ============================================================================
// Auth / session
// ============================================================================

export interface CurrentUser {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  full_name: string;
  email: string;
}

export interface Tenant {
  id: string;
  name: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: CurrentUser & { roles: string[] };
}

export interface MeResponse {
  user: CurrentUser;
  tenant: Tenant;
  roles: string[];
  permissions: string[];
  branches: Branch[];
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
  | "payroll"
  | "expenses"
  | "timetable";

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

export interface LibraryIssueFilters {
  status?: string | null;
  student_id?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface LibraryStats {
  total_books: number;
  total_copies: number;
  available_copies: number;
  issued_count: number;
  overdue_count: number;
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

export interface BulkMarkAttendanceInput {
  branch_id: string;
  class_id: string;
  section_id?: string | null;
  entries: { student_id: string; attendance_date: string; status: AttendanceStatus; remarks?: string | null }[];
}

export interface AttendanceRosterRangeEntry {
  student_id: string;
  first_name: string;
  last_name?: string | null;
  days: Record<string, { status: AttendanceStatus; remarks: string | null }>;
}

export interface AttendanceReportRow {
  student_id: string;
  student_name: string;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  leave: number;
  working_days: number;
  percent_present: number;
}

export interface StaffAttendanceReportRow {
  staff_id: string;
  staff_name: string;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  leave: number;
  working_days: number;
  percent_present: number;
}

// ============================================================================
// Fees & Billing
// ============================================================================

export type FeeFrequency = "one_time" | "monthly" | "quarterly" | "annual";
export type InvoiceStatus = "pending" | "partial" | "paid" | "overdue" | "waived" | "voided";
export type PaymentMethod = "cash" | "cheque" | "upi" | "card" | "online" | "bank_transfer";
// Tenant-extensible (see FeeCategory below) -- these are just the seeded
// defaults, kept as a fallback label/color lookup for them.
export type FeeType = string;

export const FEE_TYPE_LABELS: Record<string, string> = {
  tuition: "Tuition",
  transport: "Transport",
  library: "Library",
  exam: "Exam",
  hostel: "Hostel",
  admission: "Admission / One-time",
  other: "Other",
};

export interface FeeCategory {
  id: string;
  name: string;
  key: string;
  is_system: boolean;
}

export interface FeeStructure {
  id: string;
  branch_id: string;
  // null means "session-independent" -- applies until explicitly changed.
  academic_session_id: string | null;
  class_id?: string | null;
  name: string;
  /** minor units (paise) */
  amount: number;
  frequency: FeeFrequency;
  fee_type: FeeType;
}

export interface NewFeeStructureInput {
  branch_id: string;
  academic_session_id: string | null;
  class_id?: string | null;
  name: string;
  amount: number;
  frequency: FeeFrequency;
  fee_type?: FeeType;
}

export interface UpdateFeeStructureInput {
  id: string;
  name: string;
  amount: number;
  frequency: FeeFrequency;
  fee_type: FeeType;
  class_id?: string | null;
  academic_session_id: string | null;
}

export interface VoidInvoiceInput {
  invoice_id: string;
  reason: string;
}

export interface EditInvoiceInput {
  invoice_id: string;
  amount_due: number;
  due_date?: string | null;
  reason: string;
}

export interface ReversePaymentInput {
  payment_id: string;
  reason: string;
}

export interface EditPaymentInput {
  payment_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  remarks?: string | null;
  reason: string;
}

export interface FeeInvoiceListItem {
  id: string;
  student_id: string;
  student_name: string;
  class_name?: string | null;
  section_name?: string | null;
  roll_number?: string | null;
  date_of_birth?: string | null;
  guardian_name?: string | null;
  fee_structure_name: string;
  fee_type: FeeType;
  period_label: string;
  gross_amount: number;
  discount_amount: number;
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
  remarks?: string | null;
}

export interface RecordPaymentInput {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  receipt_number?: string | null;
  remarks?: string | null;
}

export interface RecordPaymentBatchInput {
  entries: { invoice_id: string; amount: number }[];
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

export interface PaymentListItem {
  id: string;
  invoice_id: string;
  student_id: string;
  student_name: string;
  fee_structure_name: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  receipt_number?: string | null;
  remarks?: string | null;
}

export interface ReceiptLine {
  payment: {
    id: string;
    amount: number;
    payment_method: PaymentMethod;
    payment_date: string;
    receipt_number?: string | null;
    remarks?: string | null;
  };
  invoice: FeeInvoiceListItem;
}

export interface StudentFeeAssignment {
  id: string;
  student_id?: string;
  student_name?: string;
  class_name?: string | null;
  fee_structure_id?: string;
  fee_structure_name?: string;
  mode: "include" | "exclude";
  reason?: string | null;
}

export interface SetStudentFeeAssignmentInput {
  student_id: string;
  fee_structure_id: string;
  mode: "include" | "exclude";
  reason?: string | null;
}

export interface FeeDiscount {
  id: string;
  name: string;
  key: string;
  discount_type: "percentage" | "flat";
  /** percentage points, or minor units (paise) when flat */
  value: number;
  fee_category_id?: string | null;
  is_active: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface NewFeeDiscountInput {
  name: string;
  discount_type: "percentage" | "flat";
  value: number;
  fee_category_id?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface UpdateFeeDiscountInput {
  id: string;
  name: string;
  discount_type: "percentage" | "flat";
  value: number;
  fee_category_id?: string | null;
  is_active?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface DiscountAssignee {
  id: string;
  student_id: string;
  student_name: string;
  class_name?: string | null;
  reason?: string | null;
}

export interface StudentDiscount {
  id: string;
  fee_discount_id: string;
  fee_discount_name: string;
  discount_type: "percentage" | "flat";
  value: number;
  reason?: string | null;
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

// ============================================================================
// Class Subjects & Electives
// ============================================================================

export interface ClassSubject {
  id: string;
  class_id: string;
  subject_id: string;
  subject_name: string;
  is_elective: boolean;
}

export interface ElectiveGroupMember {
  id: string;
  class_subject_id: string;
  subject_id: string;
  subject_name: string;
}

export interface ElectiveGroup {
  id: string;
  class_id: string;
  name: string;
  members: ElectiveGroupMember[];
}

export interface StudentElectiveChoice {
  id: string;
  elective_group_id: string;
  elective_group_name: string;
  subject_id: string;
  subject_name: string;
  academic_session_id: string;
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
  results_published_at?: string | null;
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

export type ExamResult = "pass" | "fail" | "grace";

export interface MarksRosterEntry {
  student_id: string;
  first_name: string;
  last_name?: string | null;
  max_marks: number;
  marks_obtained?: number | null;
  is_absent: boolean;
  result?: ExamResult | null;
}

export interface SaveMarksInput {
  exam_id: string;
  subject_id: string;
  entries: {
    student_id: string;
    max_marks: number;
    marks_obtained?: number | null;
    is_absent: boolean;
    override_result?: ExamResult | null;
  }[];
}

export interface ReportCardSubjectRow {
  subject_name: string;
  max_marks: number;
  marks_obtained?: number | null;
  is_absent: boolean;
  result?: ExamResult | null;
  backpaper_marks_obtained?: number | null;
}

export interface ReportCard {
  student_id: string;
  student_name: string;
  class_name?: string | null;
  section_name?: string | null;
  roll_number?: string | null;
  date_of_birth?: string | null;
  guardian_name?: string | null;
  exam_name: string;
  rows: ReportCardSubjectRow[];
  total_obtained: number;
  total_max: number;
  percentage: number;
  overall_result: "pass" | "fail" | "pending";
  results_published: boolean;
}

export interface MyTeachingAssignment {
  subject_id: string;
  subject_name: string;
}

export interface SubmissionStatusEntry {
  subject_id: string;
  subject_name: string;
  expected_count: number;
  entered_count: number;
  is_complete: boolean;
  teachers: string[];
}

// ============================================================================
// RBAC: permissions, roles, users
// ============================================================================

export interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

export interface PermissionCatalogEntry {
  key: string;
  label: string;
  description?: string;
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

export type StaffStatus = "active" | "on_leave" | "relieved" | "terminated" | "inactive";
export type EmploymentType = "full_time" | "part_time" | "contract";

export interface StaffCategory {
  id: string;
  name: string;
  is_system: boolean;
}

// Generic tenant-customizable lookup list item (student category, religion,
// nationality, mother tongue, blood group, gender, guardian relation) --
// see Master Data admin page. `type` is one of MASTER_DATA_TYPES below.
export interface MasterDataItem {
  id: string;
  type: string;
  name: string;
  is_system: boolean;
}

export const MASTER_DATA_TYPES = [
  "gender",
  "blood_group",
  "religion",
  "nationality",
  "mother_tongue",
  "student_category",
  "guardian_relation",
  "expense_category",
] as const;

export type MasterDataType = (typeof MASTER_DATA_TYPES)[number];

export const MASTER_DATA_TYPE_LABELS: Record<MasterDataType, string> = {
  gender: "Gender",
  blood_group: "Blood Group",
  religion: "Religion",
  nationality: "Nationality",
  mother_tongue: "Mother Tongue",
  student_category: "Student Category",
  guardian_relation: "Guardian Relation",
  expense_category: "Expense Category",
};

export interface StaffListItem {
  id: string;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  designation: string;
  category_id?: string | null;
  department?: string | null;
  status: StaffStatus;
  has_login: boolean;
}

export interface ListStaffFilters {
  category_id?: string;
  department?: string;
  status?: StaffStatus;
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
  category_id?: string | null;
  department?: string | null;
  employment_type: EmploymentType;
  date_of_joining: string;
  date_of_leaving?: string | null;
  status: StaffStatus;
  qualification?: string | null;
  blood_group?: string | null;
  photo_path?: string | null;
  signature_url?: string | null;
  is_principal: boolean;
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
  /** Leave blank to auto-generate "{branch code}-{sequence}". */
  employee_code?: string;
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
  category_id?: string | null;
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
  signature_url?: string | null;
  is_principal?: boolean;
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

export interface StaffAttendanceRosterRangeEntry {
  staff_id: string;
  first_name: string;
  last_name?: string | null;
  designation: string;
  days: Record<string, { status: string; remarks: string | null }>;
}

export interface BulkMarkStaffAttendanceInput {
  branch_id: string;
  entries: { staff_id: string; attendance_date: string; status: AttendanceStatus; remarks?: string | null }[];
}

export type StaffLeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface StaffLeaveRequest {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: StaffLeaveStatus;
  requested_by_user_id: string;
  decided_by_user_id?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at: string;
}

export interface StaffLeaveRequestListItem extends StaffLeaveRequest {
  staff_name: string;
}

export interface ApplyStaffLeaveInput {
  start_date: string;
  end_date: string;
  reason?: string | null;
}

export interface FileStaffLeaveInput extends ApplyStaffLeaveInput {
  staff_id: string;
}

export interface TransferCertificate {
  student_id: string;
  admission_number?: string | null;
  first_name: string;
  last_name?: string | null;
  date_of_birth?: string | null;
  class_name?: string | null;
  section_name?: string | null;
  date_of_admission?: string | null;
  date_of_leaving?: string | null;
  reason_for_leaving?: string | null;
  conduct_remark?: string | null;
  tc_number?: string | null;
  tc_issue_date?: string | null;
  status: StudentStatus;
}

export interface IssueTransferCertificateInput {
  reason_for_leaving: string;
  date_of_leaving: string;
  conduct_remark?: string | null;
}

export interface ExperienceLetter {
  staff_id: string;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  designation: string;
  department?: string | null;
  date_of_joining: string;
  date_of_leaving?: string | null;
  reason_for_leaving?: string | null;
  conduct_remark?: string | null;
  experience_letter_number?: string | null;
  experience_letter_issue_date?: string | null;
  status: string;
}

export interface IssueExperienceLetterInput {
  reason_for_leaving: string;
  date_of_leaving: string;
  conduct_remark?: string | null;
}

export interface Expense {
  id: string;
  branch_id: string;
  category_id?: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_mode?: string | null;
  vendor_name?: string | null;
  has_receipt: boolean;
  recorded_by_user_id: string;
  created_at: string;
}

export interface CreateExpenseInput {
  branch_id: string;
  category_id?: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_mode?: string | null;
  vendor_name?: string | null;
}

export interface UpdateExpenseInput {
  category_id?: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_mode?: string | null;
  vendor_name?: string | null;
}

export interface ExpenseSummary {
  total: number;
  by_category: { category_id: string | null; amount: number }[];
  by_month: { month: string; amount: number }[];
}

export type DocumentOwnerType = "student" | "staff";

export interface PersonDocument {
  id: string;
  label: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_user_id: string;
  created_at: string;
}

export interface PresignedUpload {
  url: string;
  method: "PUT";
  expires_at: string;
  storage_key: string;
}

// QR code attendance + photo upload -- reuses DocumentOwnerType ("student" |
// "staff") to dispatch between the two owner-scoped route families.
export interface QrCodeToken {
  token: string;
}

export interface StudentQrCodeBulkEntry {
  student_id: string;
  token: string;
}

export interface StaffQrCodeBulkEntry {
  staff_id: string;
  token: string;
}

export interface PhotoUrl {
  url: string | null;
  expires_at?: string;
}

export interface StudentPhotoUrlBulkEntry {
  student_id: string;
  url: string;
  expires_at: string;
}

export interface StaffPhotoUrlBulkEntry {
  staff_id: string;
  url: string;
  expires_at: string;
}

export type ScanEntityType = "student" | "staff";

export interface ScanResult {
  status: "marked" | "already_marked";
  existing_status?: string;
  student_id?: string;
  staff_id?: string;
  name: string;
  class_name?: string | null;
  section_name?: string | null;
  designation?: string;
  photo_path?: string | null;
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

export interface PayrollRunDetail {
  run: PayrollRun;
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

export interface BirthdayEntry {
  id: string;
  name: string;
  role: "student" | "staff";
}

export interface UpcomingHoliday {
  id: string;
  date: string;
  name: string;
  type: "holiday" | "half_day";
}

export interface UpcomingExam {
  id: string;
  name: string;
  exam_date: string | null;
}

export interface DashboardStats {
  total_students: number;
  enrolled_count: number;
  applied_count: number;
  alumni_count: number;
  todays_attendance_present: number;
  todays_attendance_total: number;
  // Omitted entirely by the backend (not just hidden) when the caller lacks fees.view.
  fee_collected_paise?: number;
  fee_pending_paise?: number;
  fee_status_breakdown?: FeeStatusCount[];
  overdue_books_count: number;
  enrollment_by_class: ClassCount[];
  attendance_trend: AttendanceTrendPoint[];
  birthdays_today: BirthdayEntry[];
  birthdays_tomorrow: BirthdayEntry[];
  upcoming_holidays: UpcomingHoliday[];
  upcoming_exams: UpcomingExam[];
}

// ============================================================================
// Timetable
// ============================================================================

export type PeriodType = "teaching" | "break" | "lunch";

export interface PeriodSlot {
  id: string;
  branch_id: string;
  academic_session_id: string;
  name: string;
  sort_order: number;
  start_time: string;
  end_time: string;
  period_type: PeriodType;
}

export interface NewPeriodSlotInput {
  branch_id: string;
  academic_session_id: string;
  name: string;
  sort_order: number;
  start_time: string;
  end_time: string;
  period_type?: PeriodType;
}

export interface UpdatePeriodSlotInput {
  name: string;
  sort_order: number;
  start_time: string;
  end_time: string;
  period_type?: PeriodType;
}

export interface TimetableEntry {
  id: string;
  day_of_week: number;
  period_slot_id: string;
  subject_id: string;
  subject_name: string;
  staff_id: string;
  staff_name: string;
  room_name?: string | null;
}

export interface SectionTimetable {
  section_id: string;
  class_id: string;
  period_slots: PeriodSlot[];
  entries: TimetableEntry[];
  weekly_off_days: number[];
  weekly_half_days: number[];
}

export interface SectionTimetableEntryInput {
  day_of_week: number;
  period_slot_id: string;
  subject_id: string;
  staff_id: string;
  room_name?: string | null;
}

export interface SaveSectionTimetableInput {
  branch_id: string;
  class_id: string;
  academic_session_id: string;
  entries: SectionTimetableEntryInput[];
}

export interface StaffTimetableEntry {
  id: string;
  day_of_week: number;
  period_slot_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name: string;
  section_id: string;
  section_name: string;
  subject_id: string;
  subject_name: string;
  room_name?: string | null;
}

export const api = {
  login: (email: string, password: string) =>
    http.post<LoginResponse>("/auth/login", { email, password }, { skipAuth: true }),
  me: () => http.get<MeResponse>("/auth/me"),

  listBranches: () => http.get<Branch[]>("/branches"),
  updateBranch: (input: UpdateBranchInput) => http.patch<Branch>(`/branches/${input.id}`, input),
  listClasses: (branchId: string) => http.get<SchoolClass[]>("/classes", { branch_id: branchId }),
  createClass: (input: NewClassInput) => http.post<SchoolClass>("/classes", input),
  listSections: (classId: string) => http.get<Section[]>("/sections", { class_id: classId }),
  createSection: (input: NewSectionInput) => http.post<Section>("/sections", input),
  listAcademicSessions: () => http.get<AcademicSession[]>("/academic-sessions"),
  createAcademicSession: (input: NewAcademicSessionInput) =>
    http.post<AcademicSession>("/academic-sessions", input),
  updateAcademicSession: (input: UpdateAcademicSessionInput) =>
    http.patch<void>(`/academic-sessions/${input.id}`, input),
  currentAcademicSessionId: async () => {
    const sessions = await http.get<AcademicSession[]>("/academic-sessions");
    return sessions.find((s) => s.is_current)?.id ?? null;
  },
  getSchoolCalendar: (branchId: string, academicSessionId: string) =>
    http.get<SchoolCalendarData>("/school-calendar", { branch_id: branchId, academic_session_id: academicSessionId }),
  setWeeklyRule: (input: SetWeeklyRuleInput) => http.post<void>("/school-calendar/weekly-rule", input),
  addHoliday: (input: CreateHolidayInput) => http.post<CalendarHoliday>("/school-calendar/holidays", input),
  updateHoliday: (id: string, input: UpdateHolidayInput) => http.patch<void>(`/calendar-holidays/${id}`, input),
  deleteHoliday: (id: string) => http.delete<void>(`/calendar-holidays/${id}`),
  getDayTypes: (branchId: string, startDate: string, endDate: string) =>
    http.get<Record<string, DayType>>("/school-calendar/day-types", {
      branch_id: branchId,
      start_date: startDate,
      end_date: endDate,
    }),
  updateClass: (input: UpdateClassInput) => http.patch<void>(`/classes/${input.id}`, input),
  deleteClass: (id: string) => http.delete<void>(`/classes/${id}`),
  updateSection: (input: UpdateSectionInput) => http.patch<void>(`/sections/${input.id}`, input),
  deleteSection: (id: string) => http.delete<void>(`/sections/${id}`),

  listStudents: (branchId: string, filters?: ListStudentsFilters) =>
    http.get<StudentListItem[]>("/students", {
      branch_id: branchId,
      search: filters?.search,
      status: filters?.status,
      class_id: filters?.class_id,
      section_id: filters?.section_id,
      gender: filters?.gender,
    }),
  listStudentsInClass: (classId: string) => http.get<StudentListItem[]>(`/students/in-class/${classId}`),
  getStudent: (id: string) => http.get<StudentDetail>(`/students/${id}`),
  createAdmission: (input: NewAdmissionInput) => http.post<Admission>("/admissions", input),
  getAdmissionForStudent: (studentId: string) =>
    http.get<Admission | null>(`/admissions/student/${studentId}`),
  confirmAdmission: (admissionId: string) =>
    http.post<ConfirmAdmissionResult>(`/admissions/${admissionId}/confirm`),
  updateStudent: (input: UpdateStudentInput) => http.patch<void>(`/students/${input.id}`, input),
  deleteStudent: (id: string) => http.delete<void>(`/students/${id}`),
  updateGuardian: (input: UpdateGuardianInput) => http.patch<void>(`/guardians/${input.id}`, input),
  searchGuardians: (search: string) => http.get<GuardianSearchResult[]>("/guardians", { search }),
  getGuardian: (id: string) => http.get<GuardianDetail>(`/guardians/${id}`),
  addGuardianToStudent: (studentId: string, input: AddGuardianInput) =>
    http.post<{ guardian_id: string; student_guardian_id: string }>(`/students/${studentId}/guardians`, input),
  getSiblings: (studentId: string) => http.get<Sibling[]>(`/students/${studentId}/siblings`),

  getModuleSettings: (branchId: string) => http.get<ModuleSetting[]>("/module-settings", { branch_id: branchId }),

  createHouse: (input: NewHouseInput) => http.post<House>("/houses", input),
  updateHouse: (input: UpdateHouseInput) => http.patch<void>(`/houses/${input.id}`, input),
  listHouses: (branchId: string) => http.get<House[]>("/houses", { branch_id: branchId }),
  assignStudentHouse: (studentId: string, houseId: string) =>
    http.post<void>("/houses/assign-student", { student_id: studentId, house_id: houseId }),
  getStudentHouse: (studentId: string) => http.get<House | null>(`/houses/student/${studentId}`),
  awardHousePoints: (input: NewHousePointEventInput) => http.post<void>("/houses/points-events", input),
  listHousePointEvents: (branchId: string) =>
    http.get<HousePointEventListItem[]>("/houses/points-events", { branch_id: branchId }),
  getHouseLeaderboard: (branchId: string, academicSessionId?: string | null) =>
    http.get<HouseLeaderboardRow[]>("/houses/leaderboard", {
      branch_id: branchId,
      academic_session_id: academicSessionId,
    }),

  createBook: (input: NewLibraryBookInput) => http.post<LibraryBook>("/library/books", input),
  updateBook: (input: UpdateLibraryBookInput) => http.patch<void>(`/library/books/${input.id}`, input),
  listBooks: (branchId: string, search?: string) =>
    http.get<LibraryBook[]>("/library/books", { branch_id: branchId, search }),
  issueBook: (bookId: string, studentId: string, dueDate: string) =>
    http.post<void>("/library/issues", { book_id: bookId, student_id: studentId, due_date: dueDate }),
  returnBook: (issueId: string) => http.post<void>(`/library/issues/${issueId}/return`),
  listIssues: (branchId: string, filters?: LibraryIssueFilters) =>
    http.get<LibraryIssueListItem[]>("/library/issues", {
      branch_id: branchId,
      status: filters?.status,
      student_id: filters?.student_id,
      from: filters?.from,
      to: filters?.to,
    }),
  getLibraryStats: (branchId: string) => http.get<LibraryStats>("/library/stats", { branch_id: branchId }),

  createRoute: (input: NewTransportRouteInput) => http.post<TransportRoute>("/transport/routes", input),
  updateRoute: (input: UpdateTransportRouteInput) => http.patch<void>(`/transport/routes/${input.id}`, input),
  listRoutes: (branchId: string) => http.get<TransportRoute[]>("/transport/routes", { branch_id: branchId }),
  createStop: (input: NewTransportStopInput) => http.post<TransportStop>("/transport/stops", input),
  updateStop: (input: UpdateTransportStopInput) => http.patch<void>(`/transport/stops/${input.id}`, input),
  listStops: (routeId: string) => http.get<TransportStop[]>("/transport/stops", { route_id: routeId }),
  assignStudentTransport: (studentId: string, routeId: string, stopId: string) =>
    http.post<void>("/transport/assignments", { student_id: studentId, route_id: routeId, stop_id: stopId }),
  getStudentTransport: (studentId: string) =>
    http.get<StudentTransportInfo | null>(`/transport/assignments/student/${studentId}`),
  listRouteRoster: (routeId: string) => http.get<TransportRosterEntry[]>(`/transport/routes/${routeId}/roster`),

  getAttendanceRoster: (
    branchId: string,
    classId: string,
    sectionId: string | null | undefined,
    attendanceDate: string,
  ) =>
    http.get<AttendanceRosterEntry[]>("/attendance/roster", {
      branch_id: branchId,
      class_id: classId,
      section_id: sectionId,
      attendance_date: attendanceDate,
    }),
  markAttendance: (input: MarkAttendanceInput) => http.post<void>("/attendance", input),
  getAttendanceRosterRange: (
    branchId: string,
    classId: string,
    sectionId: string | null | undefined,
    startDate: string,
    endDate: string,
  ) =>
    http.get<AttendanceRosterRangeEntry[]>("/attendance/roster-range", {
      branch_id: branchId,
      class_id: classId,
      section_id: sectionId,
      start_date: startDate,
      end_date: endDate,
    }),
  markAttendanceBulk: (input: BulkMarkAttendanceInput) => http.post<void>("/attendance/bulk", input),
  canMarkAttendance: (sectionId: string | null | undefined) =>
    http.get<{ can_mark: boolean }>("/attendance/can-mark", { section_id: sectionId }),
  getStudentAttendanceHistory: (studentId: string) =>
    http.get<AttendanceHistoryEntry[]>(`/attendance/student/${studentId}/history`),
  getAttendanceReport: (
    branchId: string,
    classId: string,
    sectionId: string | null | undefined,
    startDate: string,
    endDate: string,
  ) =>
    http.get<AttendanceReportRow[]>("/attendance/report", {
      branch_id: branchId,
      class_id: classId,
      section_id: sectionId,
      start_date: startDate,
      end_date: endDate,
    }),

  listFeeCategories: () => http.get<FeeCategory[]>("/fee-categories"),
  createFeeCategory: (name: string) => http.post<FeeCategory>("/fee-categories", { name }),
  updateFeeCategory: (id: string, name: string) => http.patch<FeeCategory>(`/fee-categories/${id}`, { name }),
  deleteFeeCategory: (id: string) => http.delete<void>(`/fee-categories/${id}`),
  createFeeStructure: (input: NewFeeStructureInput) => http.post<FeeStructure>("/fee-structures", input),
  updateFeeStructure: (input: UpdateFeeStructureInput) =>
    http.patch<void>(`/fee-structures/${input.id}`, input),
  listFeeStructures: (branchId: string, feeType?: FeeType | null, classId?: string | null) =>
    http.get<FeeStructure[]>("/fee-structures", { branch_id: branchId, fee_type: feeType, class_id: classId }),
  generateInvoices: async (feeStructureId: string, upToPeriod?: string) => {
    const { created } = await http.post<{ created: number }>(`/fee-structures/${feeStructureId}/generate-invoices`, {
      up_to_period: upToPeriod,
    });
    return created;
  },
  generateInvoicesBulk: (branchId: string, academicSessionId: string, feeStructureIds?: string[], upToPeriod?: string) =>
    http.post<{ created: number; by_structure: { fee_structure_id: string; created: number }[] }>(
      "/fee-structures/generate-invoices-bulk",
      { branch_id: branchId, academic_session_id: academicSessionId, fee_structure_ids: feeStructureIds, up_to_period: upToPeriod },
    ),
  carryForwardFeeStructures: (fromSessionId: string, toSessionId: string, classMapping: Record<string, string>) =>
    http.post<{ created: number }>("/fee-structures/carry-forward", {
      from_session_id: fromSessionId,
      to_session_id: toSessionId,
      class_mapping: classMapping,
    }),
  listFeeStructureAssignments: (feeStructureId: string) =>
    http.get<StudentFeeAssignment[]>(`/fee-structures/${feeStructureId}/student-assignments`),
  listStudentFeeAssignments: (studentId: string) =>
    http.get<StudentFeeAssignment[]>(`/students/${studentId}/fee-assignments`),
  setStudentFeeAssignment: (input: SetStudentFeeAssignmentInput) =>
    http.post<StudentFeeAssignment>("/student-fee-assignments", input),
  removeStudentFeeAssignment: (id: string) => http.delete<void>(`/student-fee-assignments/${id}`),
  voidInvoice: (input: VoidInvoiceInput) => http.post<void>(`/fee-invoices/${input.invoice_id}/void`, input),
  editInvoice: (input: EditInvoiceInput) => http.patch<void>(`/fee-invoices/${input.invoice_id}`, input),
  listInvoices: (branchId: string, status?: InvoiceStatus | null, feeType?: FeeType | null, classId?: string | null) =>
    http.get<FeeInvoiceListItem[]>("/fee-invoices", { branch_id: branchId, status, fee_type: feeType, class_id: classId }),
  getStudentFeeSummary: (studentId: string) =>
    http.get<StudentFeeSummary>(`/fee-invoices/student/${studentId}/summary`),
  recordPayment: (input: RecordPaymentInput) => http.post<FeePayment>("/fee-payments", input),
  recordPaymentBatch: (input: RecordPaymentBatchInput) => http.post<FeePayment[]>("/fee-payments/batch", input),
  reversePayment: (input: ReversePaymentInput) => http.post<void>(`/fee-payments/${input.payment_id}/reverse`, input),
  editPayment: (input: EditPaymentInput) => http.patch<FeePayment>(`/fee-payments/${input.payment_id}`, input),
  listPayments: (branchId: string, filters?: { from?: string; to?: string; studentId?: string; receiptNumber?: string }) =>
    http.get<PaymentListItem[]>("/fee-payments", {
      branch_id: branchId,
      from: filters?.from,
      to: filters?.to,
      student_id: filters?.studentId,
      receipt_number: filters?.receiptNumber,
    }),
  getPaymentReceipt: (receiptNumber: string) => http.get<ReceiptLine[]>(`/fee-payments/receipt/${receiptNumber}`),

  listFeeDiscounts: () => http.get<FeeDiscount[]>("/fee-discounts"),
  createFeeDiscount: (input: NewFeeDiscountInput) => http.post<FeeDiscount>("/fee-discounts", input),
  updateFeeDiscount: (input: UpdateFeeDiscountInput) => http.patch<FeeDiscount>(`/fee-discounts/${input.id}`, input),
  deleteFeeDiscount: (id: string) => http.delete<void>(`/fee-discounts/${id}`),
  listFeeDiscountAssignees: (feeDiscountId: string) => http.get<DiscountAssignee[]>(`/fee-discounts/${feeDiscountId}/assignees`),
  assignFeeDiscount: (
    feeDiscountId: string,
    studentIds: string[],
    applyToExistingInvoices: boolean,
    reason?: string | null,
  ) =>
    http.post<{ assigned: number }>(`/fee-discounts/${feeDiscountId}/assign`, {
      student_ids: studentIds,
      apply_to_existing_invoices: applyToExistingInvoices,
      reason,
    }),
  removeFeeDiscountAssignment: (assignmentId: string) => http.delete<void>(`/fee-discounts/assignments/${assignmentId}`),
  suggestSiblingsForDiscount: (studentId: string) => http.get<Sibling[]>(`/fee-discounts/suggest-siblings/${studentId}`),
  listStudentFeeDiscounts: (studentId: string) => http.get<StudentDiscount[]>(`/students/${studentId}/fee-discounts`),

  createSubject: (input: NewSubjectInput) => http.post<Subject>("/subjects", input),
  updateSubject: (input: UpdateSubjectInput) => http.patch<void>(`/subjects/${input.id}`, input),
  listSubjects: (branchId: string) => http.get<Subject[]>("/subjects", { branch_id: branchId }),
  createExam: (input: NewExamInput) => http.post<Exam>("/exams", input),
  updateExam: (input: UpdateExamInput) => http.patch<void>(`/exams/${input.id}`, input),
  listExams: (branchId: string, classId?: string | null, academicSessionId?: string | null) =>
    http.get<Exam[]>("/exams", { branch_id: branchId, class_id: classId, academic_session_id: academicSessionId }),
  listStudentsPendingBackpaper: (examId: string, subjectId: string) =>
    http.get<BackpaperCandidate[]>(`/exams/${examId}/subjects/${subjectId}/pending-backpaper`),
  getMarksRoster: (examId: string, subjectId: string) =>
    http.get<MarksRosterEntry[]>(`/exams/${examId}/subjects/${subjectId}/marks-roster`),
  saveMarks: (input: SaveMarksInput) => http.post<void>("/exams/marks", input),
  getReportCard: (studentId: string, examId: string) =>
    http.get<ReportCard>("/exams/report-card", { student_id: studentId, exam_id: examId }),
  getMyTeachingAssignments: (examId: string) =>
    http.get<MyTeachingAssignment[]>(`/exams/${examId}/my-teaching-assignments`),
  getSubmissionStatus: (examId: string) => http.get<SubmissionStatusEntry[]>(`/exams/${examId}/submission-status`),
  publishExamResults: (examId: string) => http.post<Exam>(`/exams/${examId}/publish-results`),
  reopenExamResults: (examId: string) => http.post<Exam>(`/exams/${examId}/reopen-results`),

  listClassSubjects: (classId: string) => http.get<ClassSubject[]>(`/classes/${classId}/subjects`),
  addClassSubject: (classId: string, subjectId: string, isElective: boolean) =>
    http.post<ClassSubject>(`/classes/${classId}/subjects`, { subject_id: subjectId, is_elective: isElective }),
  removeClassSubject: (id: string) => http.delete<void>(`/class-subjects/${id}`),
  listElectiveGroups: (classId: string) => http.get<ElectiveGroup[]>(`/classes/${classId}/elective-groups`),
  createElectiveGroup: (classId: string, name: string) =>
    http.post<ElectiveGroup>(`/classes/${classId}/elective-groups`, { name }),
  addElectiveGroupMember: (groupId: string, classSubjectId: string) =>
    http.post<void>(`/elective-groups/${groupId}/members`, { class_subject_id: classSubjectId }),
  removeElectiveGroupMember: (groupId: string, classSubjectId: string) =>
    http.delete<void>(`/elective-groups/${groupId}/members/${classSubjectId}`),
  deleteElectiveGroup: (groupId: string) => http.delete<void>(`/elective-groups/${groupId}`),
  listStudentElectives: (studentId: string, academicSessionId?: string) =>
    http.get<StudentElectiveChoice[]>(`/students/${studentId}/electives`, { academic_session_id: academicSessionId }),
  electSubject: (studentId: string, electiveGroupId: string, subjectId: string, academicSessionId: string) =>
    http.post<void>(`/students/${studentId}/electives`, {
      elective_group_id: electiveGroupId,
      subject_id: subjectId,
      academic_session_id: academicSessionId,
    }),

  getDashboardStats: (branchId: string) => http.get<DashboardStats>("/dashboard/stats", { branch_id: branchId }),

  // RBAC: permissions, roles, users
  listPermissionCatalog: () => http.get<PermissionCatalogEntry[]>("/permissions/catalog"),
  listRoles: () => http.get<Role[]>("/roles"),
  createRole: (input: NewRoleInput) => http.post<Role>("/roles", input),
  updateRole: (id: string, name: string) => http.patch<void>(`/roles/${id}`, { name }),
  deleteRole: (id: string) => http.delete<void>(`/roles/${id}`),
  listRolePermissions: (roleId: string) => http.get<string[]>(`/roles/${roleId}/permissions`),
  setRolePermissions: (input: SetRolePermissionsInput) =>
    http.put<void>(`/roles/${input.role_id}/permissions`, { permission_keys: input.permission_keys }),
  listUsers: (search?: string, roleId?: string) =>
    http.get<UserSummary[]>("/users", { search, role_id: roleId }),
  assignUserRole: (userId: string, roleId: string) =>
    http.post<void>(`/users/${userId}/roles`, { role_id: roleId }),
  removeUserRole: (userId: string, roleId: string) => http.delete<void>(`/users/${userId}/roles/${roleId}`),
  setUserActive: (userId: string, isActive: boolean) =>
    http.post<void>(`/users/${userId}/active`, { is_active: isActive }),
  createStaffLogin: async (input: CreateStaffLoginInput) => {
    const { id } = await http.post<{ id: string }>("/users/staff-login", input);
    return id;
  },
  resetStaffPassword: (input: ResetStaffPasswordInput) =>
    http.post<void>(`/users/${input.user_id}/reset-password`, { password: input.new_password }),

  // Staff / HR
  listStaff: (branchId: string, search?: string, filters?: ListStaffFilters) =>
    http.get<StaffListItem[]>("/staff", {
      branch_id: branchId,
      search,
      category_id: filters?.category_id,
      department: filters?.department,
      status: filters?.status,
    }),
  getStaff: (id: string) => http.get<Staff>(`/staff/${id}`),
  createStaff: (input: NewStaffInput) => http.post<Staff>("/staff", input),
  updateStaff: (input: UpdateStaffInput) => http.patch<void>(`/staff/${input.id}`, input),
  getStaffSignature: (id: string) => http.get<{ signature_url: string | null }>(`/staff/${id}/signature`),
  getPrincipalSignature: (branchId: string) =>
    http.get<{ signature_url: string | null }>("/staff/principal", { branch_id: branchId }),
  listStaffCategories: () => http.get<StaffCategory[]>("/staff-categories"),
  createStaffCategory: (name: string) => http.post<StaffCategory>("/staff-categories", { name }),
  updateStaffCategory: (id: string, name: string) => http.patch<StaffCategory>(`/staff-categories/${id}`, { name }),
  deleteStaffCategory: (id: string) => http.delete<void>(`/staff-categories/${id}`),
  listMasterDataItems: (type: MasterDataType) => http.get<MasterDataItem[]>("/master-data", { type }),
  createMasterDataItem: (type: MasterDataType, name: string) =>
    http.post<MasterDataItem>("/master-data", { type, name }),
  updateMasterDataItem: (id: string, name: string) => http.patch<MasterDataItem>(`/master-data/${id}`, { name }),
  deleteMasterDataItem: (id: string) => http.delete<void>(`/master-data/${id}`),
  setStaffStatus: (input: SetStaffStatusInput) =>
    http.post<void>(`/staff/${input.staff_id}/status`, input),
  listTeacherAssignments: (branchId: string, staffId?: string | null) =>
    http.get<TeacherAssignment[]>("/teacher-assignments", { branch_id: branchId, staff_id: staffId }),
  createTeacherAssignment: (input: NewTeacherAssignmentInput) =>
    http.post<void>("/teacher-assignments", input),
  deleteTeacherAssignment: (id: string) => http.delete<void>(`/teacher-assignments/${id}`),
  setClassTeacher: (input: SetClassTeacherInput) =>
    http.patch<void>(`/sections/${input.section_id}/class-teacher`, { staff_id: input.staff_id }),

  // Staff attendance
  getStaffAttendanceRoster: (branchId: string, attendanceDate: string) =>
    http.get<StaffAttendanceRosterEntry[]>("/staff-attendance/roster", {
      branch_id: branchId,
      attendance_date: attendanceDate,
    }),
  markStaffAttendance: (input: MarkStaffAttendanceInput) => http.post<void>("/staff-attendance", input),
  getStaffAttendanceRosterRange: (branchId: string, startDate: string, endDate: string) =>
    http.get<StaffAttendanceRosterRangeEntry[]>("/staff-attendance/roster-range", {
      branch_id: branchId,
      start_date: startDate,
      end_date: endDate,
    }),
  markStaffAttendanceBulk: (input: BulkMarkStaffAttendanceInput) => http.post<void>("/staff-attendance/bulk", input),
  getStaffAttendanceHistory: (staffId: string) =>
    http.get<StaffAttendanceHistoryEntry[]>(`/staff-attendance/staff/${staffId}/history`),
  getStaffAttendanceReport: (branchId: string, startDate: string, endDate: string) =>
    http.get<StaffAttendanceReportRow[]>("/staff-attendance/report", {
      branch_id: branchId,
      start_date: startDate,
      end_date: endDate,
    }),

  // Staff leave -- self-service
  applyStaffLeave: (input: ApplyStaffLeaveInput) => http.post<StaffLeaveRequest>("/staff-leave/apply", input),
  getMyStaffLeave: () => http.get<StaffLeaveRequest[]>("/staff-leave/mine"),
  cancelStaffLeave: (id: string) => http.post<StaffLeaveRequest>(`/staff-leave/${id}/cancel`),

  // Staff leave -- HR/admin
  fileStaffLeave: (input: FileStaffLeaveInput) => http.post<StaffLeaveRequest>("/staff-leave", input),
  listStaffLeave: (branchId: string, status?: string) =>
    http.get<StaffLeaveRequestListItem[]>("/staff-leave", { branch_id: branchId, status }),
  decideStaffLeave: (id: string, decision: "approved" | "rejected", note?: string) =>
    http.post<StaffLeaveRequest>(`/staff-leave/${id}/decide`, { decision, note }),

  // Documents -- shared upload/list/download/delete for student & staff owners
  listDocuments: (ownerType: DocumentOwnerType, ownerId: string) =>
    http.get<PersonDocument[]>(`/${ownerType === "student" ? "students" : "staff"}/${ownerId}/documents`),
  getDocumentUploadUrl: (ownerType: DocumentOwnerType, ownerId: string, fileName: string, contentType: string) =>
    http.post<PresignedUpload>(`/${ownerType === "student" ? "students" : "staff"}/${ownerId}/documents/upload-url`, {
      file_name: fileName,
      content_type: contentType,
    }),
  createDocument: (
    ownerType: DocumentOwnerType,
    ownerId: string,
    input: { label: string; storage_key: string; file_name: string; mime_type: string; file_size: number },
  ) => http.post<PersonDocument>(`/${ownerType === "student" ? "students" : "staff"}/${ownerId}/documents`, input),
  getDocumentDownloadUrl: (ownerType: DocumentOwnerType, ownerId: string, docId: string) =>
    http.get<{ url: string; expires_at: string }>(
      `/${ownerType === "student" ? "students" : "staff"}/${ownerId}/documents/${docId}/download-url`,
    ),
  deleteDocument: (ownerType: DocumentOwnerType, ownerId: string, docId: string) =>
    http.delete<{ ok: boolean }>(`/${ownerType === "student" ? "students" : "staff"}/${ownerId}/documents/${docId}`),

  // Transfer certificate
  getTransferCertificate: (studentId: string) =>
    http.get<TransferCertificate>(`/students/${studentId}/transfer-certificate`),
  issueTransferCertificate: (studentId: string, input: IssueTransferCertificateInput) =>
    http.post<TransferCertificate>(`/students/${studentId}/transfer-certificate`, input),

  // Experience letter
  getExperienceLetter: (staffId: string) => http.get<ExperienceLetter>(`/staff/${staffId}/experience-letter`),
  issueExperienceLetter: (staffId: string, input: IssueExperienceLetterInput) =>
    http.post<ExperienceLetter>(`/staff/${staffId}/experience-letter`, input),

  // Expenses
  listExpenses: (branchId: string, opts?: { from?: string; to?: string; category_id?: string }) =>
    http.get<Expense[]>("/expenses", {
      branch_id: branchId,
      from: opts?.from,
      to: opts?.to,
      category_id: opts?.category_id,
    }),
  getExpenseSummary: (branchId: string, opts?: { from?: string; to?: string }) =>
    http.get<ExpenseSummary>("/expenses/reports/summary", { branch_id: branchId, from: opts?.from, to: opts?.to }),
  createExpense: (input: CreateExpenseInput) => http.post<Expense>("/expenses", input),
  updateExpense: (id: string, input: UpdateExpenseInput) => http.patch<Expense>(`/expenses/${id}`, input),
  deleteExpense: (id: string) => http.delete<{ ok: boolean }>(`/expenses/${id}`),
  getExpenseReceiptUploadUrl: (id: string, fileName: string, contentType: string) =>
    http.post<PresignedUpload>(`/expenses/${id}/receipt-upload-url`, { file_name: fileName, content_type: contentType }),
  attachExpenseReceipt: (id: string, storageKey: string) =>
    http.patch<Expense>(`/expenses/${id}/receipt`, { storage_key: storageKey }),
  getExpenseReceiptDownloadUrl: (id: string) =>
    http.get<{ url: string; expires_at: string }>(`/expenses/${id}/receipt-download-url`),

  // Payroll
  getSalaryStructure: (staffId: string) =>
    http.get<SalaryStructure | null>(`/salary-structures/staff/${staffId}`),
  listSalaryHistory: (staffId: string) =>
    http.get<SalaryStructure[]>(`/salary-structures/staff/${staffId}/history`),
  setSalaryStructure: (input: SetSalaryStructureInput) => http.post<void>("/salary-structures", input),
  generatePayrollRun: (input: GeneratePayrollRunInput) =>
    http.post<PayrollRunDetail>("/payroll-runs/generate", input),
  listPayrollRuns: (branchId: string) => http.get<PayrollRun[]>("/payroll-runs", { branch_id: branchId }),
  getPayrollRun: (runId: string) => http.get<PayrollRunDetail>(`/payroll-runs/${runId}`),
  finalizePayrollRun: (runId: string) => http.post<void>(`/payroll-runs/${runId}/finalize`),
  deletePayrollRun: (runId: string) => http.delete<void>(`/payroll-runs/${runId}`),
  reopenPayrollRun: (runId: string) => http.post<void>(`/payroll-runs/${runId}/reopen`),
  markPayslipPaid: (payslipId: string, paidOn: string) =>
    http.post<void>(`/payslips/${payslipId}/mark-paid`, { paid_on: paidOn }),
  adjustPayslipLineItem: (input: AdjustPayslipLineItemInput) =>
    http.post<void>(`/payslips/${input.payslip_id}/line-items`, input),

  // Session promotion / rollover
  suggestClassMapping: (branchId: string, fromSessionId: string, toSessionId: string) =>
    http.get<ClassMappingSuggestion[]>("/promotion/suggest-class-mapping", {
      branch_id: branchId,
      from_session_id: fromSessionId,
      to_session_id: toSessionId,
    }),
  createPromotionBatch: (input: CreatePromotionBatchInput) =>
    http.post<PromotionBatch>("/promotion/batches", input),
  getPromotionBatch: (batchId: string) => http.get<PromotionBatch>(`/promotion/batches/${batchId}`),
  setPromotionDecision: (input: SetPromotionDecisionInput) =>
    http.patch<void>(`/promotion/batch-items/${input.batch_item_id}`, input),
  executePromotionBatch: (batchId: string) => http.post<void>(`/promotion/batches/${batchId}/execute`),

  // Audit log
  listAuditLog: (filter: AuditLogFilter) =>
    http.get<AuditLogEntry[]>("/audit-log", {
      entity_table: filter.entity_table,
      actor_user_id: filter.actor_user_id,
      from_date: filter.from_date,
      to_date: filter.to_date,
      page: filter.page,
    }),

  // Timetable
  listPeriodSlots: (branchId: string, academicSessionId: string) =>
    http.get<PeriodSlot[]>("/timetable/period-slots", { branch_id: branchId, academic_session_id: academicSessionId }),
  createPeriodSlot: (input: NewPeriodSlotInput) => http.post<PeriodSlot>("/timetable/period-slots", input),
  updatePeriodSlot: (id: string, input: UpdatePeriodSlotInput) =>
    http.patch<PeriodSlot>(`/timetable/period-slots/${id}`, input),
  deletePeriodSlot: (id: string) => http.delete<void>(`/timetable/period-slots/${id}`),
  getSectionTimetable: (sectionId: string, academicSessionId: string) =>
    http.get<SectionTimetable>(`/timetable/sections/${sectionId}`, { academic_session_id: academicSessionId }),
  saveSectionTimetable: (sectionId: string, input: SaveSectionTimetableInput) =>
    http.put<{ warnings: string[] }>(`/timetable/sections/${sectionId}`, input),
  getStaffTimetable: (staffId: string, academicSessionId: string) =>
    http.get<StaffTimetableEntry[]>(`/timetable/staff/${staffId}`, { academic_session_id: academicSessionId }),
  getMyTimetable: (academicSessionId: string) =>
    http.get<StaffTimetableEntry[]>("/timetable/me", { academic_session_id: academicSessionId }),

  // QR codes
  getStudentQrCode: (studentId: string) => http.get<QrCodeToken>(`/students/${studentId}/qr-code`),
  reissueStudentQrCode: (studentId: string) => http.post<QrCodeToken>(`/students/${studentId}/qr-code/reissue`),
  getStudentQrCodesBulk: (ids: string[]) =>
    http.get<StudentQrCodeBulkEntry[]>("/students/qr-codes", { ids: ids.join(",") }),
  getStaffQrCode: (staffId: string) => http.get<QrCodeToken>(`/staff/${staffId}/qr-code`),
  reissueStaffQrCode: (staffId: string) => http.post<QrCodeToken>(`/staff/${staffId}/qr-code/reissue`),
  getStaffQrCodesBulk: (ids: string[]) => http.get<StaffQrCodeBulkEntry[]>("/staff/qr-codes", { ids: ids.join(",") }),

  // Photos -- single slot per person, reusing StorageService like Documents.
  getStudentPhotoUploadUrl: (studentId: string, fileName: string, contentType: string) =>
    http.get<PresignedUpload>(`/students/${studentId}/photo/upload-url`, {
      file_name: fileName,
      content_type: contentType,
    }),
  setStudentPhoto: (studentId: string, storageKey: string) =>
    http.patch<{ ok: boolean }>(`/students/${studentId}/photo`, { storage_key: storageKey }),
  getStudentPhotoUrl: (studentId: string) => http.get<PhotoUrl>(`/students/${studentId}/photo-url`),
  deleteStudentPhoto: (studentId: string) => http.delete<{ ok: boolean }>(`/students/${studentId}/photo`),
  getStudentPhotoUrlsBulk: (ids: string[]) =>
    http.get<StudentPhotoUrlBulkEntry[]>("/students/photo-urls", { ids: ids.join(",") }),
  getStaffPhotoUploadUrl: (staffId: string, fileName: string, contentType: string) =>
    http.get<PresignedUpload>(`/staff/${staffId}/photo/upload-url`, {
      file_name: fileName,
      content_type: contentType,
    }),
  setStaffPhoto: (staffId: string, storageKey: string) =>
    http.patch<{ ok: boolean }>(`/staff/${staffId}/photo`, { storage_key: storageKey }),
  getStaffPhotoUrl: (staffId: string) => http.get<PhotoUrl>(`/staff/${staffId}/photo-url`),
  deleteStaffPhoto: (staffId: string) => http.delete<{ ok: boolean }>(`/staff/${staffId}/photo`),
  getStaffPhotoUrlsBulk: (ids: string[]) =>
    http.get<StaffPhotoUrlBulkEntry[]>("/staff/photo-urls", { ids: ids.join(",") }),

  // Scan-to-mark attendance
  scanAttendance: (token: string) => http.post<ScanResult>("/attendance/scan", { token }),
  scanStaffAttendance: (token: string) => http.post<ScanResult>("/staff-attendance/scan", { token }),
};
