-- Up Migration

-- Every domain table should carry both created_at and updated_at, for a
-- consistent audit trail. 51 tables never got created_at in the original
-- schema (only updated_at); 3 never got updated_at (only created_at);
-- promotion_batch_items got neither. This migration closes every gap in
-- one pass. No backfill of historical values is needed (pre-launch, no
-- real tenant data yet) -- ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP NOT
-- NULL stamps every existing row with the migration's run time in a
-- single DDL statement (a catalog-level operation, unaffected by the
-- FORCE ROW LEVEL SECURITY policies on these tables -- unlike a real
-- UPDATE, which would need those lifted first). Matches the one table
-- that already had this right, tenants.created_at.

ALTER TABLE public.academic_sessions ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.admissions ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.attendance_records ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.branches ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.calendar_holidays ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.class_subjects ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.classes ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.exam_marks ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.exams ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.fee_categories ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.fee_discounts ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.fee_invoices ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.fee_payments ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.fee_structures ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.guardians ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.house_point_events ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.houses ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.library_books ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.library_issues ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.master_data_items ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.module_settings ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.payroll_runs ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.payslip_line_items ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.payslips ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.period_slots ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.role_permissions ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.roles ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.salary_components ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.salary_structures ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.school_calendars ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.sections ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.staff ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.staff_attendance ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.staff_categories ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.student_elective_choices ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.student_enrollments ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.student_fee_assignments ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.student_fee_discounts ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.student_guardians ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.student_houses ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.student_transport ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.students ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.subject_elective_group_members ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.subject_elective_groups ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.subjects ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.teacher_subject_assignments ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.timetable_entries ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.transport_routes ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.transport_stops ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.user_roles ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.users ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;

ALTER TABLE public.promotion_batch_items ADD COLUMN created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.promotion_batch_items ADD COLUMN updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;

ALTER TABLE public.audit_log ADD COLUMN updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.fee_invoice_discounts ADD COLUMN updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE public.promotion_batches ADD COLUMN updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;

-- Down Migration

ALTER TABLE public.academic_sessions DROP COLUMN created_at;
ALTER TABLE public.admissions DROP COLUMN created_at;
ALTER TABLE public.attendance_records DROP COLUMN created_at;
ALTER TABLE public.branches DROP COLUMN created_at;
ALTER TABLE public.calendar_holidays DROP COLUMN created_at;
ALTER TABLE public.class_subjects DROP COLUMN created_at;
ALTER TABLE public.classes DROP COLUMN created_at;
ALTER TABLE public.exam_marks DROP COLUMN created_at;
ALTER TABLE public.exams DROP COLUMN created_at;
ALTER TABLE public.fee_categories DROP COLUMN created_at;
ALTER TABLE public.fee_discounts DROP COLUMN created_at;
ALTER TABLE public.fee_invoices DROP COLUMN created_at;
ALTER TABLE public.fee_payments DROP COLUMN created_at;
ALTER TABLE public.fee_structures DROP COLUMN created_at;
ALTER TABLE public.guardians DROP COLUMN created_at;
ALTER TABLE public.house_point_events DROP COLUMN created_at;
ALTER TABLE public.houses DROP COLUMN created_at;
ALTER TABLE public.library_books DROP COLUMN created_at;
ALTER TABLE public.library_issues DROP COLUMN created_at;
ALTER TABLE public.master_data_items DROP COLUMN created_at;
ALTER TABLE public.module_settings DROP COLUMN created_at;
ALTER TABLE public.payroll_runs DROP COLUMN created_at;
ALTER TABLE public.payslip_line_items DROP COLUMN created_at;
ALTER TABLE public.payslips DROP COLUMN created_at;
ALTER TABLE public.period_slots DROP COLUMN created_at;
ALTER TABLE public.role_permissions DROP COLUMN created_at;
ALTER TABLE public.roles DROP COLUMN created_at;
ALTER TABLE public.salary_components DROP COLUMN created_at;
ALTER TABLE public.salary_structures DROP COLUMN created_at;
ALTER TABLE public.school_calendars DROP COLUMN created_at;
ALTER TABLE public.sections DROP COLUMN created_at;
ALTER TABLE public.staff DROP COLUMN created_at;
ALTER TABLE public.staff_attendance DROP COLUMN created_at;
ALTER TABLE public.staff_categories DROP COLUMN created_at;
ALTER TABLE public.student_elective_choices DROP COLUMN created_at;
ALTER TABLE public.student_enrollments DROP COLUMN created_at;
ALTER TABLE public.student_fee_assignments DROP COLUMN created_at;
ALTER TABLE public.student_fee_discounts DROP COLUMN created_at;
ALTER TABLE public.student_guardians DROP COLUMN created_at;
ALTER TABLE public.student_houses DROP COLUMN created_at;
ALTER TABLE public.student_transport DROP COLUMN created_at;
ALTER TABLE public.students DROP COLUMN created_at;
ALTER TABLE public.subject_elective_group_members DROP COLUMN created_at;
ALTER TABLE public.subject_elective_groups DROP COLUMN created_at;
ALTER TABLE public.subjects DROP COLUMN created_at;
ALTER TABLE public.teacher_subject_assignments DROP COLUMN created_at;
ALTER TABLE public.timetable_entries DROP COLUMN created_at;
ALTER TABLE public.transport_routes DROP COLUMN created_at;
ALTER TABLE public.transport_stops DROP COLUMN created_at;
ALTER TABLE public.user_roles DROP COLUMN created_at;
ALTER TABLE public.users DROP COLUMN created_at;
ALTER TABLE public.promotion_batch_items DROP COLUMN created_at;

ALTER TABLE public.audit_log DROP COLUMN updated_at;
ALTER TABLE public.fee_invoice_discounts DROP COLUMN updated_at;
ALTER TABLE public.promotion_batches DROP COLUMN updated_at;
ALTER TABLE public.promotion_batch_items DROP COLUMN updated_at;
