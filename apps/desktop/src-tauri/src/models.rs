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
