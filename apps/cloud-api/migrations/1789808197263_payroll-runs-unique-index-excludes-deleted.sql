-- Up Migration

-- payroll_runs_branch_id_period_month_period_year_key did not exclude
-- soft-deleted rows, so deleting a draft run (PayrollService.deletePayrollRun,
-- which only sets deleted_at) permanently occupied its (branch_id,
-- period_month, period_year) slot -- regenerating a run for that same
-- period afterward hit the unique constraint and threw an unhandled 500,
-- the same class of bug as the timetable period-slot sort_order collision
-- fixed earlier (a soft-delete leaving a live uniqueness slot behind).
DROP INDEX public.payroll_runs_branch_id_period_month_period_year_key;

CREATE UNIQUE INDEX payroll_runs_branch_id_period_month_period_year_key
  ON public.payroll_runs USING btree (branch_id, period_month, period_year)
  WHERE deleted_at IS NULL;

-- Down Migration

DROP INDEX public.payroll_runs_branch_id_period_month_period_year_key;

CREATE UNIQUE INDEX payroll_runs_branch_id_period_month_period_year_key
  ON public.payroll_runs USING btree (branch_id, period_month, period_year);
