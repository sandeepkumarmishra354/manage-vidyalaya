-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT,
    "subscription_status" TEXT NOT NULL DEFAULT 'trial',
    "subscription_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class_teacher_staff_id" TEXT,
    "capacity" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "admission_number" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "blood_group" TEXT,
    "photo_path" TEXT,
    "current_class_id" TEXT,
    "current_section_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enquiry',
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relation" TEXT,
    "phone" TEXT,
    "alt_phone" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "applied_class_id" TEXT,
    "academic_session_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'enquiry',
    "applied_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "remarks" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT,
    "section_id" TEXT,
    "attendance_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "marked_by" TEXT,
    "remarks" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "class_id" TEXT,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'one_time',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_structure_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "amount_due" INTEGER NOT NULL,
    "amount_paid" INTEGER NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'cash',
    "payment_date" TIMESTAMP(3) NOT NULL,
    "receipt_number" TEXT,
    "recorded_by" TEXT,
    "remarks" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exam_date" TIMESTAMP(3),
    "exam_type" TEXT NOT NULL DEFAULT 'regular',
    "parent_exam_id" TEXT,
    "passing_percentage" DOUBLE PRECISION NOT NULL DEFAULT 33.0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_marks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "max_marks" INTEGER NOT NULL DEFAULT 100,
    "marks_obtained" DOUBLE PRECISION,
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "exam_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "module_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "houses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_houses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_point_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "student_id" TEXT,
    "academic_session_id" TEXT,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "awarded_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "house_point_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_books" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "category" TEXT,
    "total_copies" INTEGER NOT NULL DEFAULT 1,
    "available_copies" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_issues" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "issued_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "returned_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issued_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "library_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_number" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "capacity" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_stops" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "pickup_time" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_transport" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_transport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT,
    "employee_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT,
    "personal_email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "designation" TEXT NOT NULL,
    "department" TEXT,
    "employment_type" TEXT NOT NULL DEFAULT 'full_time',
    "date_of_joining" TIMESTAMP(3) NOT NULL,
    "date_of_leaving" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "qualification" TEXT,
    "blood_group" TEXT,
    "photo_path" TEXT,
    "pan_number" TEXT,
    "aadhaar_number" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "bank_name" TEXT,
    "pf_number" TEXT,
    "esi_number" TEXT,
    "uan_number" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subject_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "subject_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "teacher_subject_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "attendance_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "check_in_time" TEXT,
    "check_out_time" TEXT,
    "marked_by" TEXT,
    "remarks" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "basic_amount" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "salary_structure_id" TEXT NOT NULL,
    "component_name" TEXT NOT NULL,
    "component_type" TEXT NOT NULL,
    "calculation_type" TEXT NOT NULL,
    "amount" INTEGER,
    "percent" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generated_at" TIMESTAMP(3) NOT NULL,
    "generated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "days_in_month" INTEGER NOT NULL,
    "days_present" DOUBLE PRECISION NOT NULL,
    "days_lop" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross_earnings" INTEGER NOT NULL,
    "total_deductions" INTEGER NOT NULL,
    "net_pay" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paid_on" TIMESTAMP(3),
    "remarks" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_line_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payslip_id" TEXT NOT NULL,
    "component_name" TEXT NOT NULL,
    "component_type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payslip_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "roll_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'promoted',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_batches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "from_session_id" TEXT NOT NULL,
    "to_session_id" TEXT NOT NULL,
    "class_mapping_json" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "executed_at" TIMESTAMP(3),
    "executed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_batch_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "promotion_batch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "from_class_id" TEXT,
    "from_section_id" TEXT,
    "to_class_id" TEXT,
    "to_section_id" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'promote',
    "remarks" TEXT,

    CONSTRAINT "promotion_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "actor_user_id" TEXT,
    "entity_table" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON "roles"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_key_key" ON "role_permissions"("role_id", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "classes_branch_id_academic_session_id_idx" ON "classes"("branch_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "sections_class_id_idx" ON "sections"("class_id");

-- CreateIndex
CREATE INDEX "students_tenant_id_branch_id_idx" ON "students"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "students_current_class_id_current_section_id_idx" ON "students"("current_class_id", "current_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_admission_number_key" ON "students"("tenant_id", "admission_number");

-- CreateIndex
CREATE INDEX "student_guardians_student_id_idx" ON "student_guardians"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_student_id_guardian_id_key" ON "student_guardians"("student_id", "guardian_id");

-- CreateIndex
CREATE INDEX "admissions_branch_id_stage_idx" ON "admissions"("branch_id", "stage");

-- CreateIndex
CREATE INDEX "attendance_records_branch_id_attendance_date_idx" ON "attendance_records"("branch_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_records_class_id_section_id_attendance_date_idx" ON "attendance_records"("class_id", "section_id", "attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenant_id_student_id_attendance_date_key" ON "attendance_records"("tenant_id", "student_id", "attendance_date");

-- CreateIndex
CREATE INDEX "fee_structures_branch_id_academic_session_id_idx" ON "fee_structures"("branch_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "fee_invoices_student_id_idx" ON "fee_invoices"("student_id");

-- CreateIndex
CREATE INDEX "fee_invoices_branch_id_status_idx" ON "fee_invoices"("branch_id", "status");

-- CreateIndex
CREATE INDEX "fee_payments_invoice_id_idx" ON "fee_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "subjects_branch_id_idx" ON "subjects"("branch_id");

-- CreateIndex
CREATE INDEX "exams_branch_id_class_id_academic_session_id_idx" ON "exams"("branch_id", "class_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "exam_marks_exam_id_idx" ON "exam_marks"("exam_id");

-- CreateIndex
CREATE INDEX "exam_marks_student_id_idx" ON "exam_marks"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_marks_exam_id_subject_id_student_id_key" ON "exam_marks"("exam_id", "subject_id", "student_id");

-- CreateIndex
CREATE INDEX "module_settings_branch_id_idx" ON "module_settings"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_settings_branch_id_module_key_key" ON "module_settings"("branch_id", "module_key");

-- CreateIndex
CREATE INDEX "houses_branch_id_idx" ON "houses"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "houses_branch_id_name_key" ON "houses"("branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "student_houses_student_id_key" ON "student_houses"("student_id");

-- CreateIndex
CREATE INDEX "student_houses_house_id_idx" ON "student_houses"("house_id");

-- CreateIndex
CREATE INDEX "house_point_events_house_id_idx" ON "house_point_events"("house_id");

-- CreateIndex
CREATE INDEX "house_point_events_academic_session_id_idx" ON "house_point_events"("academic_session_id");

-- CreateIndex
CREATE INDEX "library_books_branch_id_idx" ON "library_books"("branch_id");

-- CreateIndex
CREATE INDEX "library_issues_book_id_idx" ON "library_issues"("book_id");

-- CreateIndex
CREATE INDEX "library_issues_student_id_idx" ON "library_issues"("student_id");

-- CreateIndex
CREATE INDEX "library_issues_branch_id_status_idx" ON "library_issues"("branch_id", "status");

-- CreateIndex
CREATE INDEX "transport_routes_branch_id_idx" ON "transport_routes"("branch_id");

-- CreateIndex
CREATE INDEX "transport_stops_route_id_idx" ON "transport_stops"("route_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_transport_student_id_key" ON "student_transport"("student_id");

-- CreateIndex
CREATE INDEX "student_transport_route_id_idx" ON "student_transport"("route_id");

-- CreateIndex
CREATE INDEX "staff_branch_id_idx" ON "staff"("branch_id");

-- CreateIndex
CREATE INDEX "staff_user_id_idx" ON "staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_tenant_id_employee_code_key" ON "staff"("tenant_id", "employee_code");

-- CreateIndex
CREATE INDEX "teacher_subject_assignments_staff_id_idx" ON "teacher_subject_assignments"("staff_id");

-- CreateIndex
CREATE INDEX "teacher_subject_assignments_class_id_section_id_idx" ON "teacher_subject_assignments"("class_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subject_assignments_staff_id_class_id_section_id_su_key" ON "teacher_subject_assignments"("staff_id", "class_id", "section_id", "subject_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "staff_attendance_staff_id_attendance_date_idx" ON "staff_attendance"("staff_id", "attendance_date");

-- CreateIndex
CREATE INDEX "staff_attendance_branch_id_attendance_date_idx" ON "staff_attendance"("branch_id", "attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_tenant_id_staff_id_attendance_date_key" ON "staff_attendance"("tenant_id", "staff_id", "attendance_date");

-- CreateIndex
CREATE INDEX "salary_structures_staff_id_effective_from_idx" ON "salary_structures"("staff_id", "effective_from");

-- CreateIndex
CREATE INDEX "salary_components_salary_structure_id_idx" ON "salary_components"("salary_structure_id");

-- CreateIndex
CREATE INDEX "payroll_runs_branch_id_period_year_period_month_idx" ON "payroll_runs"("branch_id", "period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_branch_id_period_month_period_year_key" ON "payroll_runs"("branch_id", "period_month", "period_year");

-- CreateIndex
CREATE INDEX "payslips_payroll_run_id_idx" ON "payslips"("payroll_run_id");

-- CreateIndex
CREATE INDEX "payslips_staff_id_idx" ON "payslips"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payroll_run_id_staff_id_key" ON "payslips"("payroll_run_id", "staff_id");

-- CreateIndex
CREATE INDEX "payslip_line_items_payslip_id_idx" ON "payslip_line_items"("payslip_id");

-- CreateIndex
CREATE INDEX "student_enrollments_academic_session_id_idx" ON "student_enrollments"("academic_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_student_id_academic_session_id_key" ON "student_enrollments"("student_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "promotion_batches_branch_id_idx" ON "promotion_batches"("branch_id");

-- CreateIndex
CREATE INDEX "promotion_batch_items_promotion_batch_id_idx" ON "promotion_batch_items"("promotion_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_batch_items_promotion_batch_id_student_id_key" ON "promotion_batch_items"("promotion_batch_id", "student_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_table_entity_id_idx" ON "audit_log"("entity_table", "entity_id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_teacher_staff_id_fkey" FOREIGN KEY ("class_teacher_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_current_class_id_fkey" FOREIGN KEY ("current_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_current_section_id_fkey" FOREIGN KEY ("current_section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_applied_class_id_fkey" FOREIGN KEY ("applied_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_parent_exam_id_fkey" FOREIGN KEY ("parent_exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_houses" ADD CONSTRAINT "student_houses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_houses" ADD CONSTRAINT "student_houses_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_point_events" ADD CONSTRAINT "house_point_events_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_point_events" ADD CONSTRAINT "house_point_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_point_events" ADD CONSTRAINT "house_point_events_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_point_events" ADD CONSTRAINT "house_point_events_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transport_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_line_items" ADD CONSTRAINT "payslip_line_items_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_from_session_id_fkey" FOREIGN KEY ("from_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_to_session_id_fkey" FOREIGN KEY ("to_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_promotion_batch_id_fkey" FOREIGN KEY ("promotion_batch_id") REFERENCES "promotion_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_from_class_id_fkey" FOREIGN KEY ("from_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_to_class_id_fkey" FOREIGN KEY ("to_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_from_section_id_fkey" FOREIGN KEY ("from_section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_to_section_id_fkey" FOREIGN KEY ("to_section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
