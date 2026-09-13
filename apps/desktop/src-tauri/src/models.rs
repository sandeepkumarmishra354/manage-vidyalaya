use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    pub code: String,
    pub city: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchoolClass {
    pub id: String,
    pub branch_id: String,
    pub academic_session_id: String,
    pub name: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewClassInput {
    pub branch_id: String,
    pub academic_session_id: String,
    pub name: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub id: String,
    pub class_id: String,
    pub name: String,
    pub capacity: Option<i64>,
    pub class_teacher_staff_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewSectionInput {
    pub class_id: String,
    pub name: String,
    pub capacity: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcademicSession {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewAcademicSessionInput {
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Student {
    pub id: String,
    pub tenant_id: String,
    pub branch_id: String,
    pub admission_number: Option<String>,
    pub first_name: String,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub current_class_id: Option<String>,
    pub current_section_id: Option<String>,
    pub status: String,
    pub address: Option<String>,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentListItem {
    pub id: String,
    pub admission_number: Option<String>,
    pub first_name: String,
    pub last_name: Option<String>,
    pub status: String,
    pub class_name: Option<String>,
    pub section_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Guardian {
    pub id: String,
    pub full_name: String,
    pub relation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentDetail {
    #[serde(flatten)]
    pub student: Student,
    pub guardians: Vec<Guardian>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewAdmissionInput {
    pub branch_id: String,
    pub academic_session_id: String,
    pub applied_class_id: Option<String>,
    pub first_name: String,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub address: Option<String>,
    pub guardian_name: String,
    pub guardian_relation: String,
    pub guardian_phone: Option<String>,
    pub guardian_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Admission {
    pub id: String,
    pub student_id: String,
    pub branch_id: String,
    pub stage: String,
    pub applied_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Session {
    pub user_id: String,
    pub full_name: String,
    pub email: String,
    pub tenant_id: String,
    pub roles: Vec<String>,
    pub branch_ids: Vec<String>,
    pub entitlement_expires_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncStatus {
    pub last_synced_at: Option<String>,
    pub pending_count: i64,
    pub is_online: bool,
}

// ============================================================================
// Attendance
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttendanceRosterEntry {
    pub student_id: String,
    pub first_name: String,
    pub last_name: Option<String>,
    /// present | absent | late | half_day | leave, or null if not yet marked
    pub status: Option<String>,
    pub remarks: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MarkAttendanceEntry {
    pub student_id: String,
    pub status: String,
    pub remarks: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MarkAttendanceInput {
    pub branch_id: String,
    pub class_id: String,
    pub section_id: Option<String>,
    pub attendance_date: String,
    pub entries: Vec<MarkAttendanceEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttendanceHistoryEntry {
    pub attendance_date: String,
    pub status: String,
    pub remarks: Option<String>,
}

// ============================================================================
// Fees & Billing
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeStructure {
    pub id: String,
    pub branch_id: String,
    pub academic_session_id: String,
    pub class_id: Option<String>,
    pub name: String,
    /// Minor units (paise) -- avoids float rounding on money.
    pub amount: i64,
    pub frequency: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewFeeStructureInput {
    pub branch_id: String,
    pub academic_session_id: String,
    pub class_id: Option<String>,
    pub name: String,
    pub amount: i64,
    pub frequency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeInvoiceListItem {
    pub id: String,
    pub student_id: String,
    pub student_name: String,
    pub fee_structure_name: String,
    pub amount_due: i64,
    pub amount_paid: i64,
    pub due_date: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeePayment {
    pub id: String,
    pub invoice_id: String,
    pub amount: i64,
    pub payment_method: String,
    pub payment_date: String,
    pub receipt_number: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecordPaymentInput {
    pub invoice_id: String,
    pub amount: i64,
    pub payment_method: String,
    pub payment_date: String,
    pub receipt_number: Option<String>,
    pub remarks: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentFeeSummary {
    pub invoices: Vec<FeeInvoiceListItem>,
    pub payments: Vec<FeePayment>,
    pub total_due: i64,
    pub total_paid: i64,
}

// ============================================================================
// Exams & Report Cards
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subject {
    pub id: String,
    pub branch_id: String,
    pub name: String,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewSubjectInput {
    pub branch_id: String,
    pub name: String,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exam {
    pub id: String,
    pub branch_id: String,
    pub academic_session_id: String,
    pub class_id: String,
    pub name: String,
    pub exam_date: Option<String>,
    /// regular | back_paper | supplementary | unit_test | term
    pub exam_type: String,
    pub parent_exam_id: Option<String>,
    pub passing_percentage: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewExamInput {
    pub branch_id: String,
    pub academic_session_id: String,
    pub class_id: String,
    pub name: String,
    pub exam_date: Option<String>,
    pub exam_type: Option<String>,
    pub parent_exam_id: Option<String>,
    pub passing_percentage: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarksRosterEntry {
    pub student_id: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub max_marks: i64,
    pub marks_obtained: Option<f64>,
    pub is_absent: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveMarksEntry {
    pub student_id: String,
    pub max_marks: i64,
    pub marks_obtained: Option<f64>,
    pub is_absent: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveMarksInput {
    pub exam_id: String,
    pub subject_id: String,
    pub entries: Vec<SaveMarksEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportCardSubjectRow {
    pub subject_name: String,
    pub max_marks: i64,
    pub marks_obtained: Option<f64>,
    pub is_absent: bool,
    /// Marks from a back-paper exam linked to this one for the same
    /// subject/student, if the student sat one -- lets the report card show
    /// both attempts rather than only the original.
    pub backpaper_marks_obtained: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportCard {
    pub student_id: String,
    pub student_name: String,
    pub exam_name: String,
    pub rows: Vec<ReportCardSubjectRow>,
    pub total_obtained: f64,
    pub total_max: i64,
    pub percentage: f64,
}

// ============================================================================
// Module settings (per-branch feature toggles)
// ============================================================================

/// Modules a branch can turn off. Core areas (students/admissions, academic
/// setup, dashboard) aren't in this list -- they're never toggleable.
pub const TOGGLEABLE_MODULES: &[&str] =
    &["attendance", "fees", "exams", "library", "transport", "houses", "id_cards", "payroll"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleSetting {
    pub module_key: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetModuleEnabledInput {
    pub branch_id: String,
    pub module_key: String,
    pub is_enabled: bool,
}

// ============================================================================
// Admission confirmation
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct ConfirmAdmissionResult {
    pub admission_id: String,
    pub student_id: String,
    pub admission_number: String,
    pub stage: String,
}

// ============================================================================
// Houses
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct House {
    pub id: String,
    pub branch_id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewHouseInput {
    pub branch_id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignHouseInput {
    pub student_id: String,
    pub house_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewHousePointEventInput {
    pub branch_id: String,
    pub house_id: String,
    pub student_id: Option<String>,
    pub academic_session_id: Option<String>,
    pub points: i64,
    pub reason: String,
    pub event_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HousePointEventListItem {
    pub id: String,
    pub house_name: String,
    pub student_name: Option<String>,
    pub points: i64,
    pub reason: String,
    pub event_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseLeaderboardRow {
    pub house_id: String,
    pub house_name: String,
    pub color: Option<String>,
    pub total_points: i64,
    pub student_count: i64,
}

// ============================================================================
// Library
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryBook {
    pub id: String,
    pub branch_id: String,
    pub title: String,
    pub author: Option<String>,
    pub isbn: Option<String>,
    pub category: Option<String>,
    pub total_copies: i64,
    pub available_copies: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewLibraryBookInput {
    pub branch_id: String,
    pub title: String,
    pub author: Option<String>,
    pub isbn: Option<String>,
    pub category: Option<String>,
    pub total_copies: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IssueBookInput {
    pub book_id: String,
    pub student_id: String,
    pub due_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryIssueListItem {
    pub id: String,
    pub book_id: String,
    pub book_title: String,
    pub student_id: String,
    pub student_name: String,
    pub issued_date: String,
    pub due_date: String,
    pub returned_date: Option<String>,
    pub status: String,
}

// ============================================================================
// Transport
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportRoute {
    pub id: String,
    pub branch_id: String,
    pub name: String,
    pub vehicle_number: Option<String>,
    pub driver_name: Option<String>,
    pub driver_phone: Option<String>,
    pub capacity: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewTransportRouteInput {
    pub branch_id: String,
    pub name: String,
    pub vehicle_number: Option<String>,
    pub driver_name: Option<String>,
    pub driver_phone: Option<String>,
    pub capacity: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportStop {
    pub id: String,
    pub route_id: String,
    pub name: String,
    pub sequence: i64,
    pub pickup_time: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewTransportStopInput {
    pub route_id: String,
    pub name: String,
    pub sequence: i64,
    pub pickup_time: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignTransportInput {
    pub student_id: String,
    pub route_id: String,
    pub stop_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentTransportInfo {
    pub route_name: String,
    pub stop_name: String,
    pub pickup_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportRosterEntry {
    pub student_id: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub stop_name: String,
}

// ============================================================================
// Dashboard
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct ClassCount {
    pub class_name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttendanceTrendPoint {
    pub attendance_date: String,
    pub present_count: i64,
    pub total_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FeeStatusCount {
    pub status: String,
    pub count: i64,
    pub amount: i64,
}

// ============================================================================
// RBAC: permission catalog, roles, users
// ============================================================================

/// Hand-kept catalog of valid `permission_key` values (mirrors
/// `TOGGLEABLE_MODULES` above and `lib/permissions.ts` on the frontend --
/// kept in sync by hand across all three, same convention as `SYNCABLE_TABLES`).
/// Grouped by module; not exhaustive per sub-action, just the checks the app
/// actually makes.
pub const PERMISSION_CATALOG: &[&str] = &[
    "students.view", "students.create", "students.edit", "students.delete",
    "admissions.view", "admissions.create", "admissions.confirm",
    "attendance.mark", "attendance.view",
    "fees.view", "fees.manage", "fees.record_payment",
    "exams.view", "exams.manage", "exams.enter_marks",
    "houses.view", "houses.manage",
    "library.view", "library.manage",
    "transport.view", "transport.manage",
    "staff.view", "staff.manage",
    "staff_attendance.mark", "staff_attendance.view",
    "payroll.view", "payroll.view_own", "payroll.generate", "payroll.finalize",
    "academic_setup.view", "academic_setup.manage", "academic_setup.promote",
    "roles.manage", "users.manage",
    "audit.view",
    "module_settings.manage",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub is_system: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewRoleInput {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetRolePermissionsInput {
    pub role_id: String,
    pub permission_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSummary {
    pub id: String,
    pub full_name: String,
    pub email: String,
    pub is_active: bool,
    pub role_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateStaffLoginInput {
    pub staff_id: String,
    pub email: String,
    pub full_name: String,
    pub initial_password: String,
    pub branch_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResetStaffPasswordInput {
    pub user_id: String,
    pub new_password: String,
}

// ============================================================================
// Staff / HR
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Staff {
    pub id: String,
    pub branch_id: String,
    pub user_id: Option<String>,
    pub employee_code: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub phone: Option<String>,
    pub personal_email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub designation: String,
    pub department: Option<String>,
    pub employment_type: String,
    pub date_of_joining: String,
    pub date_of_leaving: Option<String>,
    pub status: String,
    pub qualification: Option<String>,
    pub blood_group: Option<String>,
    pub photo_path: Option<String>,
    pub pan_number: Option<String>,
    pub aadhaar_number: Option<String>,
    pub bank_account_number: Option<String>,
    pub bank_ifsc: Option<String>,
    pub bank_name: Option<String>,
    pub pf_number: Option<String>,
    pub esi_number: Option<String>,
    pub uan_number: Option<String>,
    pub emergency_contact_name: Option<String>,
    pub emergency_contact_phone: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaffListItem {
    pub id: String,
    pub employee_code: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub designation: String,
    pub department: Option<String>,
    pub status: String,
    pub has_login: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewStaffInput {
    pub branch_id: String,
    pub employee_code: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub phone: Option<String>,
    pub personal_email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub designation: String,
    pub department: Option<String>,
    pub employment_type: String,
    pub date_of_joining: String,
    pub qualification: Option<String>,
    pub blood_group: Option<String>,
    pub pan_number: Option<String>,
    pub aadhaar_number: Option<String>,
    pub bank_account_number: Option<String>,
    pub bank_ifsc: Option<String>,
    pub bank_name: Option<String>,
    pub pf_number: Option<String>,
    pub esi_number: Option<String>,
    pub uan_number: Option<String>,
    pub emergency_contact_name: Option<String>,
    pub emergency_contact_phone: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateStaffInput {
    pub id: String,
    #[serde(flatten)]
    pub fields: NewStaffInput,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetStaffStatusInput {
    pub staff_id: String,
    pub status: String,
    pub date_of_leaving: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeacherAssignment {
    pub id: String,
    pub staff_id: String,
    pub staff_name: String,
    pub class_id: String,
    pub class_name: String,
    pub section_id: Option<String>,
    pub section_name: Option<String>,
    pub subject_id: String,
    pub subject_name: String,
    pub academic_session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewTeacherAssignmentInput {
    pub branch_id: String,
    pub staff_id: String,
    pub class_id: String,
    pub section_id: Option<String>,
    pub subject_id: String,
    pub academic_session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetClassTeacherInput {
    pub section_id: String,
    pub staff_id: Option<String>,
}

// ============================================================================
// Staff attendance
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaffAttendanceRosterEntry {
    pub staff_id: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub designation: String,
    pub status: Option<String>,
    pub remarks: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MarkStaffAttendanceEntry {
    pub staff_id: String,
    pub status: String,
    pub remarks: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MarkStaffAttendanceInput {
    pub branch_id: String,
    pub attendance_date: String,
    pub entries: Vec<MarkStaffAttendanceEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaffAttendanceHistoryEntry {
    pub attendance_date: String,
    pub status: String,
    pub remarks: Option<String>,
}

// ============================================================================
// Payroll
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalaryComponent {
    pub id: Option<String>,
    pub component_name: String,
    /// earning | deduction
    pub component_type: String,
    /// fixed | percent_of_basic
    pub calculation_type: String,
    pub amount: Option<i64>,
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalaryStructure {
    pub id: String,
    pub staff_id: String,
    pub effective_from: String,
    pub basic_amount: i64,
    pub components: Vec<SalaryComponent>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetSalaryStructureInput {
    pub staff_id: String,
    pub branch_id: String,
    pub effective_from: String,
    pub basic_amount: i64,
    pub components: Vec<SalaryComponent>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeneratePayrollRunInput {
    pub branch_id: String,
    pub period_month: i64,
    pub period_year: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayrollRun {
    pub id: String,
    pub branch_id: String,
    pub period_month: i64,
    pub period_year: i64,
    pub status: String,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayslipLineItem {
    pub id: String,
    pub component_name: String,
    pub component_type: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payslip {
    pub id: String,
    pub payroll_run_id: String,
    pub staff_id: String,
    pub staff_name: String,
    pub days_in_month: i64,
    pub days_present: f64,
    pub days_lop: f64,
    pub gross_earnings: i64,
    pub total_deductions: i64,
    pub net_pay: i64,
    pub status: String,
    pub paid_on: Option<String>,
    pub line_items: Vec<PayslipLineItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayrollRunDetail {
    #[serde(flatten)]
    pub run: PayrollRun,
    pub payslips: Vec<Payslip>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdjustPayslipLineItemInput {
    pub payslip_id: String,
    pub component_name: String,
    pub component_type: String,
    pub amount: i64,
}

// ============================================================================
// Session promotion / rollover
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassMappingSuggestion {
    pub from_class_id: String,
    pub from_class_name: String,
    pub suggested_to_class_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePromotionBatchInput {
    pub branch_id: String,
    pub from_session_id: String,
    pub to_session_id: String,
    /// from_class_id -> to_class_id
    pub class_mapping: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromotionBatchItem {
    pub id: String,
    pub student_id: String,
    pub student_name: String,
    pub from_class_name: Option<String>,
    pub to_class_id: Option<String>,
    pub to_class_name: Option<String>,
    pub to_section_id: Option<String>,
    pub decision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromotionBatch {
    pub id: String,
    pub branch_id: String,
    pub from_session_id: String,
    pub to_session_id: String,
    pub status: String,
    pub items: Vec<PromotionBatchItem>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetPromotionDecisionInput {
    pub batch_item_id: String,
    pub decision: String,
    pub to_class_id: Option<String>,
    pub to_section_id: Option<String>,
}

// ============================================================================
// Back-paper / supplementary exams
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackpaperCandidate {
    pub student_id: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub marks_obtained: Option<f64>,
    pub max_marks: i64,
}

// ============================================================================
// Audit log
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub actor_name: Option<String>,
    pub entity_table: String,
    pub entity_id: String,
    pub action: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuditLogFilter {
    pub entity_table: Option<String>,
    pub actor_user_id: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub page: Option<i64>,
}

// ============================================================================
// Update inputs for entities that previously had create-only commands
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGuardianInput {
    pub id: String,
    pub full_name: String,
    pub relation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateStudentInput {
    pub id: String,
    pub first_name: String,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub blood_group: Option<String>,
    pub current_class_id: Option<String>,
    pub current_section_id: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateClassInput {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSectionInput {
    pub id: String,
    pub name: String,
    pub capacity: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAcademicSessionInput {
    pub id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateFeeStructureInput {
    pub id: String,
    pub name: String,
    pub amount: i64,
    pub frequency: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VoidInvoiceInput {
    pub invoice_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReversePaymentInput {
    pub payment_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSubjectInput {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateExamInput {
    pub id: String,
    pub name: String,
    pub exam_date: Option<String>,
    pub passing_percentage: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateHouseInput {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLibraryBookInput {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub isbn: Option<String>,
    pub category: Option<String>,
    pub total_copies: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTransportRouteInput {
    pub id: String,
    pub name: String,
    pub vehicle_number: Option<String>,
    pub driver_name: Option<String>,
    pub driver_phone: Option<String>,
    pub capacity: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTransportStopInput {
    pub id: String,
    pub name: String,
    pub sequence: i64,
    pub pickup_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardStats {
    pub total_students: i64,
    pub enrolled_count: i64,
    pub applied_count: i64,
    pub alumni_count: i64,
    pub todays_attendance_present: i64,
    pub todays_attendance_total: i64,
    pub fee_collected_paise: i64,
    pub fee_pending_paise: i64,
    pub overdue_books_count: i64,
    pub enrollment_by_class: Vec<ClassCount>,
    pub attendance_trend: Vec<AttendanceTrendPoint>,
    pub fee_status_breakdown: Vec<FeeStatusCount>,
}
