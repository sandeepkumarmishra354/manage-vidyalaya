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
CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.admissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.calendar_holidays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.exam_marks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_invoice_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.house_point_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.houses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.library_books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.library_issues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.master_data_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.module_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payslip_line_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.period_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.promotion_batch_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.promotion_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.salary_components FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.salary_structures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.school_calendars FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_elective_choices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_fee_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_fee_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_houses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.student_transport FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subject_elective_group_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subject_elective_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.teacher_subject_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.timetable_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transport_stops FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Down Migration

DROP TRIGGER set_updated_at ON public.academic_sessions;
DROP TRIGGER set_updated_at ON public.admissions;
DROP TRIGGER set_updated_at ON public.attendance_records;
DROP TRIGGER set_updated_at ON public.audit_log;
DROP TRIGGER set_updated_at ON public.branches;
DROP TRIGGER set_updated_at ON public.calendar_holidays;
DROP TRIGGER set_updated_at ON public.class_subjects;
DROP TRIGGER set_updated_at ON public.classes;
DROP TRIGGER set_updated_at ON public.exam_marks;
DROP TRIGGER set_updated_at ON public.exams;
DROP TRIGGER set_updated_at ON public.expenses;
DROP TRIGGER set_updated_at ON public.fee_categories;
DROP TRIGGER set_updated_at ON public.fee_discounts;
DROP TRIGGER set_updated_at ON public.fee_invoice_discounts;
DROP TRIGGER set_updated_at ON public.fee_invoices;
DROP TRIGGER set_updated_at ON public.fee_payments;
DROP TRIGGER set_updated_at ON public.fee_structures;
DROP TRIGGER set_updated_at ON public.guardians;
DROP TRIGGER set_updated_at ON public.house_point_events;
DROP TRIGGER set_updated_at ON public.houses;
DROP TRIGGER set_updated_at ON public.library_books;
DROP TRIGGER set_updated_at ON public.library_issues;
DROP TRIGGER set_updated_at ON public.master_data_items;
DROP TRIGGER set_updated_at ON public.module_settings;
DROP TRIGGER set_updated_at ON public.payroll_runs;
DROP TRIGGER set_updated_at ON public.payslip_line_items;
DROP TRIGGER set_updated_at ON public.payslips;
DROP TRIGGER set_updated_at ON public.period_slots;
DROP TRIGGER set_updated_at ON public.promotion_batch_items;
DROP TRIGGER set_updated_at ON public.promotion_batches;
DROP TRIGGER set_updated_at ON public.role_permissions;
DROP TRIGGER set_updated_at ON public.roles;
DROP TRIGGER set_updated_at ON public.salary_components;
DROP TRIGGER set_updated_at ON public.salary_structures;
DROP TRIGGER set_updated_at ON public.school_calendars;
DROP TRIGGER set_updated_at ON public.sections;
DROP TRIGGER set_updated_at ON public.staff;
DROP TRIGGER set_updated_at ON public.staff_attendance;
DROP TRIGGER set_updated_at ON public.staff_categories;
DROP TRIGGER set_updated_at ON public.staff_documents;
DROP TRIGGER set_updated_at ON public.staff_leave_requests;
DROP TRIGGER set_updated_at ON public.student_documents;
DROP TRIGGER set_updated_at ON public.student_elective_choices;
DROP TRIGGER set_updated_at ON public.student_enrollments;
DROP TRIGGER set_updated_at ON public.student_fee_assignments;
DROP TRIGGER set_updated_at ON public.student_fee_discounts;
DROP TRIGGER set_updated_at ON public.student_guardians;
DROP TRIGGER set_updated_at ON public.student_houses;
DROP TRIGGER set_updated_at ON public.student_transport;
DROP TRIGGER set_updated_at ON public.students;
DROP TRIGGER set_updated_at ON public.subject_elective_group_members;
DROP TRIGGER set_updated_at ON public.subject_elective_groups;
DROP TRIGGER set_updated_at ON public.subjects;
DROP TRIGGER set_updated_at ON public.teacher_subject_assignments;
DROP TRIGGER set_updated_at ON public.tenants;
DROP TRIGGER set_updated_at ON public.timetable_entries;
DROP TRIGGER set_updated_at ON public.transport_routes;
DROP TRIGGER set_updated_at ON public.transport_stops;
DROP TRIGGER set_updated_at ON public.user_roles;
DROP TRIGGER set_updated_at ON public.users;

DROP FUNCTION public.set_updated_at();
