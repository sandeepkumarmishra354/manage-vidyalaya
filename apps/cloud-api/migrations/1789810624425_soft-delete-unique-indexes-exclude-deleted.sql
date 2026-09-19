-- Up Migration

-- Same bug class as the timetable period-slot sort_order collision and the
-- payroll_runs period-reuse bug (both fixed earlier): every index below
-- backs a table whose only "delete" is a soft delete (an UPDATE setting
-- deleted_at), but the index itself has no `WHERE deleted_at IS NULL`
-- filter -- so a soft-deleted row permanently occupies its slot in the
-- unique key, and recreating a row with the same key (e.g. re-adding a
-- subject to a class after removing it, or a holiday on the same date
-- after deleting it) throws an unhandled 500 on the unique-constraint
-- violation instead of succeeding. Found by directly reproducing the
-- calendar_holidays case (delete a holiday, then a Playwright regression
-- test re-adds one on the same date), then auditing every other
-- softDeleteRow/updateRow(deleted_at) call site against its table's
-- unique indexes for the same pattern.
--
-- A partial index is strictly less restrictive than the full index it
-- replaces (it can only permit inserts the old index blocked, for rows
-- whose conflicting sibling is already soft-deleted) -- so this cannot
-- introduce a new duplicate-active-row possibility.

DROP INDEX public.calendar_holidays_school_calendar_id_date_key;
CREATE UNIQUE INDEX calendar_holidays_school_calendar_id_date_key
  ON public.calendar_holidays USING btree (school_calendar_id, date)
  WHERE deleted_at IS NULL;

DROP INDEX public.class_subjects_class_id_subject_id_key;
CREATE UNIQUE INDEX class_subjects_class_id_subject_id_key
  ON public.class_subjects USING btree (class_id, subject_id)
  WHERE deleted_at IS NULL;

DROP INDEX public.subject_elective_groups_class_id_name_key;
CREATE UNIQUE INDEX subject_elective_groups_class_id_name_key
  ON public.subject_elective_groups USING btree (class_id, name)
  WHERE deleted_at IS NULL;

DROP INDEX public.subject_elective_group_members_elective_group_id_class_subj_key;
CREATE UNIQUE INDEX subject_elective_group_members_elective_group_id_class_subj_key
  ON public.subject_elective_group_members USING btree (elective_group_id, class_subject_id)
  WHERE deleted_at IS NULL;

DROP INDEX public.fee_categories_tenant_id_key_key;
CREATE UNIQUE INDEX fee_categories_tenant_id_key_key
  ON public.fee_categories USING btree (tenant_id, key)
  WHERE deleted_at IS NULL;

DROP INDEX public.fee_discounts_tenant_id_key_key;
CREATE UNIQUE INDEX fee_discounts_tenant_id_key_key
  ON public.fee_discounts USING btree (tenant_id, key)
  WHERE deleted_at IS NULL;

DROP INDEX public.master_data_items_tenant_id_type_name_key;
CREATE UNIQUE INDEX master_data_items_tenant_id_type_name_key
  ON public.master_data_items USING btree (tenant_id, type, name)
  WHERE deleted_at IS NULL;

DROP INDEX public.staff_categories_tenant_id_name_key;
CREATE UNIQUE INDEX staff_categories_tenant_id_name_key
  ON public.staff_categories USING btree (tenant_id, name)
  WHERE deleted_at IS NULL;

DROP INDEX public.roles_tenant_id_name_key;
CREATE UNIQUE INDEX roles_tenant_id_name_key
  ON public.roles USING btree (tenant_id, name)
  WHERE deleted_at IS NULL;

DROP INDEX public.teacher_subject_assignments_staff_id_class_id_section_id_su_key;
CREATE UNIQUE INDEX teacher_subject_assignments_staff_id_class_id_section_id_su_key
  ON public.teacher_subject_assignments USING btree (staff_id, class_id, section_id, subject_id, academic_session_id)
  WHERE deleted_at IS NULL;

-- Down Migration

DROP INDEX public.calendar_holidays_school_calendar_id_date_key;
CREATE UNIQUE INDEX calendar_holidays_school_calendar_id_date_key
  ON public.calendar_holidays USING btree (school_calendar_id, date);

DROP INDEX public.class_subjects_class_id_subject_id_key;
CREATE UNIQUE INDEX class_subjects_class_id_subject_id_key
  ON public.class_subjects USING btree (class_id, subject_id);

DROP INDEX public.subject_elective_groups_class_id_name_key;
CREATE UNIQUE INDEX subject_elective_groups_class_id_name_key
  ON public.subject_elective_groups USING btree (class_id, name);

DROP INDEX public.subject_elective_group_members_elective_group_id_class_subj_key;
CREATE UNIQUE INDEX subject_elective_group_members_elective_group_id_class_subj_key
  ON public.subject_elective_group_members USING btree (elective_group_id, class_subject_id);

DROP INDEX public.fee_categories_tenant_id_key_key;
CREATE UNIQUE INDEX fee_categories_tenant_id_key_key
  ON public.fee_categories USING btree (tenant_id, key);

DROP INDEX public.fee_discounts_tenant_id_key_key;
CREATE UNIQUE INDEX fee_discounts_tenant_id_key_key
  ON public.fee_discounts USING btree (tenant_id, key);

DROP INDEX public.master_data_items_tenant_id_type_name_key;
CREATE UNIQUE INDEX master_data_items_tenant_id_type_name_key
  ON public.master_data_items USING btree (tenant_id, type, name);

DROP INDEX public.staff_categories_tenant_id_name_key;
CREATE UNIQUE INDEX staff_categories_tenant_id_name_key
  ON public.staff_categories USING btree (tenant_id, name);

DROP INDEX public.roles_tenant_id_name_key;
CREATE UNIQUE INDEX roles_tenant_id_name_key
  ON public.roles USING btree (tenant_id, name);

DROP INDEX public.teacher_subject_assignments_staff_id_class_id_section_id_su_key;
CREATE UNIQUE INDEX teacher_subject_assignments_staff_id_class_id_section_id_su_key
  ON public.teacher_subject_assignments USING btree (staff_id, class_id, section_id, subject_id, academic_session_id);
