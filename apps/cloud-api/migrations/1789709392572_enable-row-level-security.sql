-- Up Migration

-- Restricted runtime role for the app connection (vidyalaya_app itself is
-- created out-of-band by an ops/superuser step, not by this migration --
-- CREATE ROLE requires a role attribute (CREATEROLE) the schema-owning
-- `vidyalaya` migration role deliberately does not have). This migration
-- only grants it the minimum it needs once it exists.

-- Deliberately NOT using `FORCE ROW LEVEL SECURITY` yet: this repo is
-- mid-migration off Prisma, and Prisma's connection still runs as the
-- table-owning `vidyalaya` role for every not-yet-converted module. RLS
-- policies never apply to a table's owner unless FORCE is set, so leaving
-- FORCE off keeps every still-Prisma-backed query working exactly as
-- before. Tables converted to DbService connect as `vidyalaya_app`
-- instead (a non-owner role, so RLS applies to it with no FORCE needed)
-- and get real enforcement immediately. FORCE ROW LEVEL SECURITY is added
-- for every table in the final cutover migration, once nothing queries as
-- the owner anymore -- see the cutover batch.

GRANT USAGE ON SCHEMA public TO vidyalaya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vidyalaya_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_sessions TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admissions TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_holidays TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_subjects TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_marks TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_categories TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_discounts TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_invoice_discounts TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_invoices TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_payments TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_structures TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardians TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.house_point_events TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.houses TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_issues TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_data_items TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_settings TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslip_line_items TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_slots TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_batch_items TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_batches TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_components TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_structures TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_calendars TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_categories TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_documents TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_leave_requests TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_documents TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_elective_choices TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_enrollments TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_fee_assignments TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_fee_discounts TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_houses TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_transport TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_elective_group_members TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_elective_groups TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subject_assignments TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_entries TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_routes TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_stops TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO vidyalaya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO vidyalaya_app;

-- The `tenants` table has no tenant_id column (it IS the tenant) and is
-- deliberately excluded from RLS -- resolving which tenant a request belongs
-- to necessarily happens before any tenant_id session variable is set.
GRANT SELECT ON public.tenants TO vidyalaya_app;

ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.academic_sessions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.admissions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.attendance_records
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.audit_log
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.branches
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.calendar_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.calendar_holidays
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.class_subjects
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.classes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.exam_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.exam_marks
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.exams
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.expenses
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.fee_categories
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.fee_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.fee_discounts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.fee_invoice_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.fee_invoice_discounts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.fee_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.fee_invoices
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.fee_payments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.fee_structures
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.guardians
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.house_point_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.house_point_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.houses
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.library_books
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.library_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.library_issues
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.master_data_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.master_data_items
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.module_settings
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.payroll_runs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.payslip_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.payslip_line_items
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.payslips
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.period_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.period_slots
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.promotion_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.promotion_batch_items
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.promotion_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.promotion_batches
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.role_permissions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.roles
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.salary_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.salary_components
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.salary_structures
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.school_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.school_calendars
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.sections
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.staff
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.staff_attendance
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.staff_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.staff_categories
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.staff_documents
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.staff_leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.staff_leave_requests
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_documents
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_elective_choices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_elective_choices
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_enrollments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_fee_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_fee_assignments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_fee_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_fee_discounts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_guardians
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_houses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_houses
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.student_transport ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.student_transport
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.students
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.subject_elective_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.subject_elective_group_members
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.subject_elective_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.subject_elective_groups
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.subjects
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.teacher_subject_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.teacher_subject_assignments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.timetable_entries
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.transport_routes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.transport_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.transport_stops
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.user_roles
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.users
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Down Migration

DROP POLICY IF EXISTS tenant_isolation ON public.academic_sessions;
ALTER TABLE public.academic_sessions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.admissions;
ALTER TABLE public.admissions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.attendance_records;
ALTER TABLE public.attendance_records DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.audit_log;
ALTER TABLE public.audit_log DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.branches;
ALTER TABLE public.branches DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.calendar_holidays;
ALTER TABLE public.calendar_holidays DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.class_subjects;
ALTER TABLE public.class_subjects DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.classes;
ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.exam_marks;
ALTER TABLE public.exam_marks DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.exams;
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.expenses;
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.fee_categories;
ALTER TABLE public.fee_categories DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.fee_discounts;
ALTER TABLE public.fee_discounts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.fee_invoice_discounts;
ALTER TABLE public.fee_invoice_discounts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.fee_invoices;
ALTER TABLE public.fee_invoices DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.fee_payments;
ALTER TABLE public.fee_payments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.fee_structures;
ALTER TABLE public.fee_structures DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.guardians;
ALTER TABLE public.guardians DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.house_point_events;
ALTER TABLE public.house_point_events DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.houses;
ALTER TABLE public.houses DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.library_books;
ALTER TABLE public.library_books DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.library_issues;
ALTER TABLE public.library_issues DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.master_data_items;
ALTER TABLE public.master_data_items DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.module_settings;
ALTER TABLE public.module_settings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.payroll_runs;
ALTER TABLE public.payroll_runs DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.payslip_line_items;
ALTER TABLE public.payslip_line_items DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.payslips;
ALTER TABLE public.payslips DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.period_slots;
ALTER TABLE public.period_slots DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.promotion_batch_items;
ALTER TABLE public.promotion_batch_items DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.promotion_batches;
ALTER TABLE public.promotion_batches DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.role_permissions;
ALTER TABLE public.role_permissions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.roles;
ALTER TABLE public.roles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.salary_components;
ALTER TABLE public.salary_components DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.salary_structures;
ALTER TABLE public.salary_structures DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.school_calendars;
ALTER TABLE public.school_calendars DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.sections;
ALTER TABLE public.sections DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.staff;
ALTER TABLE public.staff DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.staff_attendance;
ALTER TABLE public.staff_attendance DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.staff_categories;
ALTER TABLE public.staff_categories DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.staff_documents;
ALTER TABLE public.staff_documents DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.staff_leave_requests;
ALTER TABLE public.staff_leave_requests DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_documents;
ALTER TABLE public.student_documents DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_elective_choices;
ALTER TABLE public.student_elective_choices DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_enrollments;
ALTER TABLE public.student_enrollments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_fee_assignments;
ALTER TABLE public.student_fee_assignments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_fee_discounts;
ALTER TABLE public.student_fee_discounts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_guardians;
ALTER TABLE public.student_guardians DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_houses;
ALTER TABLE public.student_houses DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.student_transport;
ALTER TABLE public.student_transport DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.students;
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.subject_elective_group_members;
ALTER TABLE public.subject_elective_group_members DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.subject_elective_groups;
ALTER TABLE public.subject_elective_groups DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.subjects;
ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.teacher_subject_assignments;
ALTER TABLE public.teacher_subject_assignments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.timetable_entries;
ALTER TABLE public.timetable_entries DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.transport_routes;
ALTER TABLE public.transport_routes DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.transport_stops;
ALTER TABLE public.transport_stops DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.user_roles;
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.users;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

REVOKE SELECT ON public.tenants FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.academic_sessions FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.admissions FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.attendance_records FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.audit_log FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.branches FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.calendar_holidays FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.class_subjects FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.classes FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.exam_marks FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.exams FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.expenses FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fee_categories FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fee_discounts FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fee_invoice_discounts FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fee_invoices FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fee_payments FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.fee_structures FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.guardians FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.house_point_events FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.houses FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.library_books FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.library_issues FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.master_data_items FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.module_settings FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payslip_line_items FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payslips FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.period_slots FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.promotion_batch_items FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.promotion_batches FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.role_permissions FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.roles FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.salary_components FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.salary_structures FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.school_calendars FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sections FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_categories FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_documents FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_leave_requests FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_documents FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_elective_choices FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_enrollments FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_fee_assignments FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_fee_discounts FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_guardians FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_houses FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.student_transport FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.students FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subject_elective_group_members FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subject_elective_groups FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subjects FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.teacher_subject_assignments FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.timetable_entries FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.transport_routes FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.transport_stops FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_roles FROM vidyalaya_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.users FROM vidyalaya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM vidyalaya_app;
REVOKE USAGE ON SCHEMA public FROM vidyalaya_app;
