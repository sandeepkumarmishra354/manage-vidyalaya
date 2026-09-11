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
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewSectionInput {
    pub class_id: String,
    pub name: String,
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
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewExamInput {
    pub branch_id: String,
    pub academic_session_id: String,
    pub class_id: String,
    pub name: String,
    pub exam_date: Option<String>,
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
    &["attendance", "fees", "exams", "library", "transport", "houses", "id_cards"];

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
