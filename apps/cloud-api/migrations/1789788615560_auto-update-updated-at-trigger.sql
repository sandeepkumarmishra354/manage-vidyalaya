-- Up Migration

-- updated_at across every table is app-managed today (every INSERT/UPDATE
-- call site passes it explicitly) -- correct so far, but nothing enforces
-- it, and with 60 tables and dozens of raw-SQL UPDATE call sites, a future
-- one is one missed assignment away from silently going stale. A trigger
-- makes that structurally impossible instead of relying on every call site
-- remembering, the same reasoning that motivated giving created_at a DB
-- default rather than leaving it purely app-managed.
--
-- Hand-rolled function rather than the bundled moddatetime extension:
-- CREATE EXTENSION moddatetime requires superuser, and the role migrations
-- actually run as here (and most managed Postgres app roles in general)
-- isn't superuser -- confirmed directly against this database. A plain
-- CREATE FUNCTION/CREATE TRIGGER needs no elevated privilege.
--
-- BEFORE UPDATE only -- created_at's DEFAULT CURRENT_TIMESTAMP already
-- covers INSERT, and every insertRow()/raw INSERT call site already sets
-- updated_at explicitly at creation time too, so there's no INSERT-side
-- gap this needs to close.
--
-- Existing app-level `updated_at: now` assignments on UPDATE are left in
-- place -- the trigger unconditionally overwrites NEW.updated_at with
-- CURRENT_TIMESTAMP regardless of what the statement supplies, so they
-- become redundant but harmless. Not worth a mechanical sweep to delete
-- them from every call site for a change with no behavioral effect.

-- Schema-qualified rather than relying on search_path -- a freshly
-- created role (e.g. CI's) doesn't necessarily have `public` on its
-- search_path even when it owns the database, and an unqualified CREATE
-- FUNCTION then fails with "no schema has been selected to create in".
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.academic_sessions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.admissions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.admissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.attendance_records;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.audit_log;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.branches;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.calendar_holidays;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.calendar_holidays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.class_subjects;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.classes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.exam_marks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.exam_marks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.exams;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.expenses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_categories;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_discounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_invoice_discounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_invoice_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_invoices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_payments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_structures;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.guardians;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.house_point_events;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.house_point_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.houses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.houses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.library_books;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.library_books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.library_issues;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.library_issues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.master_data_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.master_data_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.module_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.module_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.payroll_runs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.payslip_line_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payslip_line_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.payslips;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.period_slots;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.period_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.promotion_batch_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.promotion_batch_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.promotion_batches;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.promotion_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.role_permissions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.roles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.salary_components;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.salary_components FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.salary_structures;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.salary_structures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.school_calendars;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.school_calendars FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.sections;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.staff;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_attendance;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_categories;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_documents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_leave_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_documents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_elective_choices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_elective_choices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_enrollments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_fee_assignments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_fee_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_fee_discounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_fee_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_guardians;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_houses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_houses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.student_transport;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_transport FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.students;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.subject_elective_group_members;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subject_elective_group_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.subject_elective_groups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subject_elective_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.subjects;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.teacher_subject_assignments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.teacher_subject_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.tenants;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.timetable_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.timetable_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.transport_routes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.transport_stops;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transport_stops FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.user_roles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.users;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS set_updated_at ON public.academic_sessions;
DROP TRIGGER IF EXISTS set_updated_at ON public.admissions;
DROP TRIGGER IF EXISTS set_updated_at ON public.attendance_records;
DROP TRIGGER IF EXISTS set_updated_at ON public.audit_log;
DROP TRIGGER IF EXISTS set_updated_at ON public.branches;
DROP TRIGGER IF EXISTS set_updated_at ON public.calendar_holidays;
DROP TRIGGER IF EXISTS set_updated_at ON public.class_subjects;
DROP TRIGGER IF EXISTS set_updated_at ON public.classes;
DROP TRIGGER IF EXISTS set_updated_at ON public.exam_marks;
DROP TRIGGER IF EXISTS set_updated_at ON public.exams;
DROP TRIGGER IF EXISTS set_updated_at ON public.expenses;
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_categories;
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_discounts;
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_invoice_discounts;
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_invoices;
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_payments;
DROP TRIGGER IF EXISTS set_updated_at ON public.fee_structures;
DROP TRIGGER IF EXISTS set_updated_at ON public.guardians;
DROP TRIGGER IF EXISTS set_updated_at ON public.house_point_events;
DROP TRIGGER IF EXISTS set_updated_at ON public.houses;
DROP TRIGGER IF EXISTS set_updated_at ON public.library_books;
DROP TRIGGER IF EXISTS set_updated_at ON public.library_issues;
DROP TRIGGER IF EXISTS set_updated_at ON public.master_data_items;
DROP TRIGGER IF EXISTS set_updated_at ON public.module_settings;
DROP TRIGGER IF EXISTS set_updated_at ON public.payroll_runs;
DROP TRIGGER IF EXISTS set_updated_at ON public.payslip_line_items;
DROP TRIGGER IF EXISTS set_updated_at ON public.payslips;
DROP TRIGGER IF EXISTS set_updated_at ON public.period_slots;
DROP TRIGGER IF EXISTS set_updated_at ON public.promotion_batch_items;
DROP TRIGGER IF EXISTS set_updated_at ON public.promotion_batches;
DROP TRIGGER IF EXISTS set_updated_at ON public.role_permissions;
DROP TRIGGER IF EXISTS set_updated_at ON public.roles;
DROP TRIGGER IF EXISTS set_updated_at ON public.salary_components;
DROP TRIGGER IF EXISTS set_updated_at ON public.salary_structures;
DROP TRIGGER IF EXISTS set_updated_at ON public.school_calendars;
DROP TRIGGER IF EXISTS set_updated_at ON public.sections;
DROP TRIGGER IF EXISTS set_updated_at ON public.staff;
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_attendance;
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_categories;
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_documents;
DROP TRIGGER IF EXISTS set_updated_at ON public.staff_leave_requests;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_documents;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_elective_choices;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_enrollments;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_fee_assignments;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_fee_discounts;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_guardians;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_houses;
DROP TRIGGER IF EXISTS set_updated_at ON public.student_transport;
DROP TRIGGER IF EXISTS set_updated_at ON public.students;
DROP TRIGGER IF EXISTS set_updated_at ON public.subject_elective_group_members;
DROP TRIGGER IF EXISTS set_updated_at ON public.subject_elective_groups;
DROP TRIGGER IF EXISTS set_updated_at ON public.subjects;
DROP TRIGGER IF EXISTS set_updated_at ON public.teacher_subject_assignments;
DROP TRIGGER IF EXISTS set_updated_at ON public.tenants;
DROP TRIGGER IF EXISTS set_updated_at ON public.timetable_entries;
DROP TRIGGER IF EXISTS set_updated_at ON public.transport_routes;
DROP TRIGGER IF EXISTS set_updated_at ON public.transport_stops;
DROP TRIGGER IF EXISTS set_updated_at ON public.user_roles;
DROP TRIGGER IF EXISTS set_updated_at ON public.users;

DROP FUNCTION IF EXISTS public.set_updated_at();
