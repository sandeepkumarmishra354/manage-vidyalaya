-- Up Migration

-- Cutover: every module now queries through vidyalaya_app (the
-- restricted, RLS-subject role) via DbService -- nothing connects as
-- the schema-owning vidyalaya role anymore except the deliberately
-- tenant-less escape hatches (DbService.queryUnscoped, the seed
-- script). FORCE ROW LEVEL SECURITY closes the one remaining gap:
-- without it, RLS policies never apply to a table's owner, so the
-- owning role could still read/write across every tenant by mistake.
-- With FORCE, the tenant_isolation policy added in the previous
-- migration applies unconditionally to every role, table owner
-- included -- a forgotten tenant_id predicate is now physically
-- impossible to exploit, not just discouraged by convention.

ALTER TABLE public.academic_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_holidays FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.classes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_marks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exams FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_discounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoice_discounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.house_point_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.houses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_books FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_issues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_data_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.module_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payslip_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payslips FORCE ROW LEVEL SECURITY;
ALTER TABLE public.period_slots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_batch_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salary_components FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salary_structures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.school_calendars FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_leave_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_elective_choices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_discounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_houses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_transport FORCE ROW LEVEL SECURITY;
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subject_elective_group_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subject_elective_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subject_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transport_routes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transport_stops FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
-- Down Migration

ALTER TABLE public.academic_sessions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_holidays NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.classes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exam_marks NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exams NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_categories NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_discounts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoice_discounts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoices NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.guardians NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.house_point_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.houses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_books NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_issues NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.master_data_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.module_settings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payslip_line_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payslips NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.period_slots NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_batch_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_batches NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salary_components NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salary_structures NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.school_calendars NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sections NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_categories NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_documents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_leave_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_documents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_elective_choices NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_assignments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_discounts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_houses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_transport NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.students NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subject_elective_group_members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subject_elective_groups NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subjects NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subject_assignments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transport_routes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transport_stops NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users NO FORCE ROW LEVEL SECURITY;