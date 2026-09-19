-- Up Migration

-- Half-day leave: when true, this request is for a single date
-- (start_date = end_date is enforced at the application layer, in
-- StaffLeaveService) and, once approved, StaffLeaveService writes a
-- 'half_day' staff_attendance row instead of 'leave' for that date --
-- payroll's existing LOP calculation already treats half_day as 0.5 days
-- present / 0.5 days LOP (half pay deduction), so no payroll.service.ts
-- changes are needed.
ALTER TABLE public.staff_leave_requests
  ADD COLUMN is_half_day boolean DEFAULT false NOT NULL;

-- Down Migration

ALTER TABLE public.staff_leave_requests
  DROP COLUMN is_half_day;
