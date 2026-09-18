-- Up Migration

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: academic_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_sessions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    start_date timestamp(3) without time zone NOT NULL,
    end_date timestamp(3) without time zone NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: admissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admissions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    student_id text NOT NULL,
    applied_class_id text,
    academic_session_id text NOT NULL,
    stage text DEFAULT 'enquiry'::text NOT NULL,
    applied_at timestamp(3) without time zone NOT NULL,
    decided_at timestamp(3) without time zone,
    decided_by text,
    remarks text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    student_id text NOT NULL,
    class_id text,
    section_id text,
    attendance_date timestamp(3) without time zone NOT NULL,
    status text NOT NULL,
    marked_by text,
    remarks text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text,
    actor_user_id text,
    entity_table text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    summary text NOT NULL,
    before_json jsonb,
    after_json jsonb,
    created_at timestamp(3) without time zone NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    address text,
    city text,
    state text,
    pincode text,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    email text,
    logo_url text,
    phone text,
    signature_url text,
    print_paper_color text DEFAULT 'white'::text NOT NULL,
    print_template text DEFAULT 'classic'::text NOT NULL
);


--
-- Name: calendar_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_holidays (
    id text NOT NULL,
    tenant_id text NOT NULL,
    school_calendar_id text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: class_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_subjects (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    class_id text NOT NULL,
    subject_id text NOT NULL,
    is_elective boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    academic_session_id text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: exam_marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_marks (
    id text NOT NULL,
    tenant_id text NOT NULL,
    exam_id text NOT NULL,
    subject_id text NOT NULL,
    student_id text NOT NULL,
    max_marks integer DEFAULT 100 NOT NULL,
    marks_obtained double precision,
    is_absent boolean DEFAULT false NOT NULL,
    remarks text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    result text
);


--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    academic_session_id text NOT NULL,
    class_id text NOT NULL,
    name text NOT NULL,
    exam_date timestamp(3) without time zone,
    exam_type text DEFAULT 'regular'::text NOT NULL,
    parent_exam_id text,
    passing_percentage double precision DEFAULT 33.0 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    results_published_at timestamp(3) without time zone
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    category_id text,
    description text NOT NULL,
    amount integer NOT NULL,
    expense_date timestamp(3) without time zone NOT NULL,
    payment_mode text,
    vendor_name text,
    receipt_storage_key text,
    recorded_by_user_id text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: fee_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_categories (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    key text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: fee_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_discounts (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    key text NOT NULL,
    discount_type text NOT NULL,
    value integer NOT NULL,
    fee_category_id text,
    is_active boolean DEFAULT true NOT NULL,
    valid_from timestamp(3) without time zone,
    valid_to timestamp(3) without time zone,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: fee_invoice_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_invoice_discounts (
    id text NOT NULL,
    tenant_id text NOT NULL,
    fee_invoice_id text NOT NULL,
    fee_discount_id text NOT NULL,
    amount integer NOT NULL,
    created_at timestamp(3) without time zone NOT NULL
);


--
-- Name: fee_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_invoices (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    student_id text NOT NULL,
    fee_structure_id text NOT NULL,
    academic_session_id text NOT NULL,
    amount_due integer NOT NULL,
    amount_paid integer DEFAULT 0 NOT NULL,
    due_date timestamp(3) without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    discount_amount integer DEFAULT 0 NOT NULL,
    gross_amount integer DEFAULT 0 NOT NULL,
    period_label text DEFAULT ''::text NOT NULL
);


--
-- Name: fee_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_payments (
    id text NOT NULL,
    tenant_id text NOT NULL,
    invoice_id text NOT NULL,
    amount integer NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    payment_date timestamp(3) without time zone NOT NULL,
    receipt_number text,
    recorded_by text,
    remarks text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: fee_structures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_structures (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    academic_session_id text,
    class_id text,
    name text NOT NULL,
    amount integer NOT NULL,
    frequency text DEFAULT 'one_time'::text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    fee_type text DEFAULT 'tuition'::text NOT NULL
);


--
-- Name: guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardians (
    id text NOT NULL,
    tenant_id text NOT NULL,
    full_name text NOT NULL,
    relation text,
    phone text,
    alt_phone text,
    email text,
    occupation text,
    address text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    aadhaar_number text,
    annual_income integer
);


--
-- Name: house_point_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.house_point_events (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    house_id text NOT NULL,
    student_id text,
    academic_session_id text,
    points integer NOT NULL,
    reason text NOT NULL,
    event_date timestamp(3) without time zone NOT NULL,
    awarded_by text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: houses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.houses (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    name text NOT NULL,
    color text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: library_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_books (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    title text NOT NULL,
    author text,
    isbn text,
    category text,
    total_copies integer DEFAULT 1 NOT NULL,
    available_copies integer DEFAULT 1 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: library_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_issues (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    book_id text NOT NULL,
    student_id text NOT NULL,
    issued_date timestamp(3) without time zone NOT NULL,
    due_date timestamp(3) without time zone NOT NULL,
    returned_date timestamp(3) without time zone,
    status text DEFAULT 'issued'::text NOT NULL,
    issued_by text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: master_data_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_data_items (
    id text NOT NULL,
    tenant_id text NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: module_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_settings (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    module_key text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_runs (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    period_month integer NOT NULL,
    period_year integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    generated_at timestamp(3) without time zone NOT NULL,
    generated_by text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: payslip_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslip_line_items (
    id text NOT NULL,
    tenant_id text NOT NULL,
    payslip_id text NOT NULL,
    component_name text NOT NULL,
    component_type text NOT NULL,
    amount integer NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslips (
    id text NOT NULL,
    tenant_id text NOT NULL,
    payroll_run_id text NOT NULL,
    staff_id text NOT NULL,
    days_in_month double precision NOT NULL,
    days_present double precision NOT NULL,
    days_lop double precision DEFAULT 0 NOT NULL,
    gross_earnings integer NOT NULL,
    total_deductions integer NOT NULL,
    net_pay integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    paid_on timestamp(3) without time zone,
    remarks text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: period_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.period_slots (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    academic_session_id text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL,
    period_type text DEFAULT 'teaching'::text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: promotion_batch_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_batch_items (
    id text NOT NULL,
    tenant_id text NOT NULL,
    promotion_batch_id text NOT NULL,
    student_id text NOT NULL,
    from_class_id text,
    from_section_id text,
    to_class_id text,
    to_section_id text,
    decision text DEFAULT 'promote'::text NOT NULL,
    remarks text
);


--
-- Name: promotion_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_batches (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    from_session_id text NOT NULL,
    to_session_id text NOT NULL,
    class_mapping_json jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    executed_at timestamp(3) without time zone,
    executed_by text,
    created_at timestamp(3) without time zone NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    role_id text NOT NULL,
    permission_key text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: salary_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_components (
    id text NOT NULL,
    tenant_id text NOT NULL,
    salary_structure_id text NOT NULL,
    component_name text NOT NULL,
    component_type text NOT NULL,
    calculation_type text NOT NULL,
    amount integer,
    percent double precision,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: salary_structures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_structures (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    staff_id text NOT NULL,
    effective_from timestamp(3) without time zone NOT NULL,
    basic_amount integer NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: school_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_calendars (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    academic_session_id text NOT NULL,
    weekly_off_days integer[] DEFAULT ARRAY[]::integer[],
    weekly_half_days integer[] DEFAULT ARRAY[]::integer[],
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sections (
    id text NOT NULL,
    tenant_id text NOT NULL,
    class_id text NOT NULL,
    name text NOT NULL,
    class_teacher_staff_id text,
    capacity integer,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    user_id text,
    employee_code text NOT NULL,
    first_name text NOT NULL,
    last_name text,
    date_of_birth timestamp(3) without time zone,
    gender text,
    phone text,
    personal_email text,
    address text,
    city text,
    state text,
    pincode text,
    designation text NOT NULL,
    department text,
    employment_type text DEFAULT 'full_time'::text NOT NULL,
    date_of_joining timestamp(3) without time zone NOT NULL,
    date_of_leaving timestamp(3) without time zone,
    status text DEFAULT 'active'::text NOT NULL,
    qualification text,
    blood_group text,
    photo_path text,
    pan_number text,
    aadhaar_number text,
    bank_account_number text,
    bank_ifsc text,
    bank_name text,
    pf_number text,
    esi_number text,
    uan_number text,
    emergency_contact_name text,
    emergency_contact_phone text,
    notes text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    category_id text,
    is_principal boolean DEFAULT false NOT NULL,
    signature_url text,
    conduct_remark text,
    experience_letter_issue_date timestamp(3) without time zone,
    experience_letter_number text,
    reason_for_leaving text,
    qr_code_version integer DEFAULT 1 NOT NULL
);


--
-- Name: staff_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_attendance (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    staff_id text NOT NULL,
    attendance_date timestamp(3) without time zone NOT NULL,
    status text NOT NULL,
    check_in_time text,
    check_out_time text,
    marked_by text,
    remarks text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: staff_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_categories (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: staff_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_documents (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    staff_id text NOT NULL,
    label text NOT NULL,
    storage_key text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    uploaded_by_user_id text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: staff_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_leave_requests (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    staff_id text NOT NULL,
    start_date timestamp(3) without time zone NOT NULL,
    end_date timestamp(3) without time zone NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by_user_id text NOT NULL,
    decided_by_user_id text,
    decided_at timestamp(3) without time zone,
    decision_note text,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_documents (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    student_id text NOT NULL,
    label text NOT NULL,
    storage_key text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    uploaded_by_user_id text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_elective_choices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_elective_choices (
    id text NOT NULL,
    tenant_id text NOT NULL,
    student_id text NOT NULL,
    elective_group_id text NOT NULL,
    subject_id text NOT NULL,
    academic_session_id text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_enrollments (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    student_id text NOT NULL,
    academic_session_id text NOT NULL,
    class_id text NOT NULL,
    section_id text,
    roll_number text,
    status text DEFAULT 'promoted'::text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_fee_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_fee_assignments (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    student_id text NOT NULL,
    fee_structure_id text NOT NULL,
    mode text NOT NULL,
    reason text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_fee_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_fee_discounts (
    id text NOT NULL,
    tenant_id text NOT NULL,
    student_id text NOT NULL,
    fee_discount_id text NOT NULL,
    reason text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_guardians (
    id text NOT NULL,
    tenant_id text NOT NULL,
    student_id text NOT NULL,
    guardian_id text NOT NULL,
    relation text NOT NULL,
    is_primary_contact boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_houses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_houses (
    id text NOT NULL,
    tenant_id text NOT NULL,
    student_id text NOT NULL,
    house_id text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: student_transport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_transport (
    id text NOT NULL,
    tenant_id text NOT NULL,
    student_id text NOT NULL,
    route_id text NOT NULL,
    stop_id text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    admission_number text,
    first_name text NOT NULL,
    last_name text,
    date_of_birth timestamp(3) without time zone,
    gender text,
    blood_group text,
    photo_path text,
    current_class_id text,
    current_section_id text,
    status text DEFAULT 'enquiry'::text NOT NULL,
    address text,
    city text,
    state text,
    pincode text,
    notes text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    aadhaar_number text,
    category text,
    emergency_contact_name text,
    emergency_contact_phone text,
    medical_notes text,
    mother_tongue text,
    nationality text,
    previous_school_name text,
    religion text,
    roll_number text,
    alumni_contact_email text,
    alumni_notes text,
    conduct_remark text,
    current_occupation text,
    date_of_leaving timestamp(3) without time zone,
    graduation_year integer,
    higher_education text,
    reason_for_leaving text,
    tc_issue_date timestamp(3) without time zone,
    tc_number text,
    qr_code_version integer DEFAULT 1 NOT NULL
);


--
-- Name: subject_elective_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject_elective_group_members (
    id text NOT NULL,
    tenant_id text NOT NULL,
    elective_group_id text NOT NULL,
    class_subject_id text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: subject_elective_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject_elective_groups (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    class_id text NOT NULL,
    name text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    name text NOT NULL,
    code text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: teacher_subject_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_subject_assignments (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    staff_id text NOT NULL,
    class_id text NOT NULL,
    section_id text,
    subject_id text NOT NULL,
    academic_session_id text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id text NOT NULL,
    name text NOT NULL,
    subdomain text,
    subscription_status text DEFAULT 'trial'::text NOT NULL,
    subscription_expires_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: timetable_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_entries (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    academic_session_id text NOT NULL,
    class_id text NOT NULL,
    section_id text NOT NULL,
    day_of_week integer NOT NULL,
    period_slot_id text NOT NULL,
    subject_id text NOT NULL,
    staff_id text NOT NULL,
    room_name text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: transport_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_routes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text NOT NULL,
    name text NOT NULL,
    vehicle_number text,
    driver_name text,
    driver_phone text,
    capacity integer,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: transport_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_stops (
    id text NOT NULL,
    tenant_id text NOT NULL,
    route_id text NOT NULL,
    name text NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    pickup_time text,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    role_id text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    tenant_id text NOT NULL,
    branch_id text,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    password_hash text,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: academic_sessions academic_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_sessions
    ADD CONSTRAINT academic_sessions_pkey PRIMARY KEY (id);


--
-- Name: admissions admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: calendar_holidays calendar_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT calendar_holidays_pkey PRIMARY KEY (id);


--
-- Name: class_subjects class_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: exam_marks exam_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_pkey PRIMARY KEY (id);


--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: fee_categories fee_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_pkey PRIMARY KEY (id);


--
-- Name: fee_discounts fee_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_discounts
    ADD CONSTRAINT fee_discounts_pkey PRIMARY KEY (id);


--
-- Name: fee_invoice_discounts fee_invoice_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_discounts
    ADD CONSTRAINT fee_invoice_discounts_pkey PRIMARY KEY (id);


--
-- Name: fee_invoices fee_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_pkey PRIMARY KEY (id);


--
-- Name: fee_payments fee_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_pkey PRIMARY KEY (id);


--
-- Name: fee_structures fee_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_pkey PRIMARY KEY (id);


--
-- Name: guardians guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);


--
-- Name: house_point_events house_point_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.house_point_events
    ADD CONSTRAINT house_point_events_pkey PRIMARY KEY (id);


--
-- Name: houses houses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.houses
    ADD CONSTRAINT houses_pkey PRIMARY KEY (id);


--
-- Name: library_books library_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_books
    ADD CONSTRAINT library_books_pkey PRIMARY KEY (id);


--
-- Name: library_issues library_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues
    ADD CONSTRAINT library_issues_pkey PRIMARY KEY (id);


--
-- Name: master_data_items master_data_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_data_items
    ADD CONSTRAINT master_data_items_pkey PRIMARY KEY (id);


--
-- Name: module_settings module_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_settings
    ADD CONSTRAINT module_settings_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: payslip_line_items payslip_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslip_line_items
    ADD CONSTRAINT payslip_line_items_pkey PRIMARY KEY (id);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: period_slots period_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_slots
    ADD CONSTRAINT period_slots_pkey PRIMARY KEY (id);


--
-- Name: promotion_batch_items promotion_batch_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batch_items
    ADD CONSTRAINT promotion_batch_items_pkey PRIMARY KEY (id);


--
-- Name: promotion_batches promotion_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batches
    ADD CONSTRAINT promotion_batches_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: salary_components salary_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_pkey PRIMARY KEY (id);


--
-- Name: salary_structures salary_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_structures
    ADD CONSTRAINT salary_structures_pkey PRIMARY KEY (id);


--
-- Name: school_calendars school_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_calendars
    ADD CONSTRAINT school_calendars_pkey PRIMARY KEY (id);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance staff_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_pkey PRIMARY KEY (id);


--
-- Name: staff_categories staff_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_categories
    ADD CONSTRAINT staff_categories_pkey PRIMARY KEY (id);


--
-- Name: staff_documents staff_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_pkey PRIMARY KEY (id);


--
-- Name: staff_leave_requests staff_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: student_documents student_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_documents
    ADD CONSTRAINT student_documents_pkey PRIMARY KEY (id);


--
-- Name: student_elective_choices student_elective_choices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_elective_choices
    ADD CONSTRAINT student_elective_choices_pkey PRIMARY KEY (id);


--
-- Name: student_enrollments student_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollments
    ADD CONSTRAINT student_enrollments_pkey PRIMARY KEY (id);


--
-- Name: student_fee_assignments student_fee_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_assignments
    ADD CONSTRAINT student_fee_assignments_pkey PRIMARY KEY (id);


--
-- Name: student_fee_discounts student_fee_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_discounts
    ADD CONSTRAINT student_fee_discounts_pkey PRIMARY KEY (id);


--
-- Name: student_guardians student_guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_pkey PRIMARY KEY (id);


--
-- Name: student_houses student_houses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_houses
    ADD CONSTRAINT student_houses_pkey PRIMARY KEY (id);


--
-- Name: student_transport student_transport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transport
    ADD CONSTRAINT student_transport_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: subject_elective_group_members subject_elective_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_elective_group_members
    ADD CONSTRAINT subject_elective_group_members_pkey PRIMARY KEY (id);


--
-- Name: subject_elective_groups subject_elective_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_elective_groups
    ADD CONSTRAINT subject_elective_groups_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: teacher_subject_assignments teacher_subject_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subject_assignments
    ADD CONSTRAINT teacher_subject_assignments_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: timetable_entries timetable_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_pkey PRIMARY KEY (id);


--
-- Name: transport_routes transport_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_routes
    ADD CONSTRAINT transport_routes_pkey PRIMARY KEY (id);


--
-- Name: transport_stops transport_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_stops
    ADD CONSTRAINT transport_stops_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admissions_branch_id_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admissions_branch_id_stage_idx ON public.admissions USING btree (branch_id, stage);


--
-- Name: attendance_records_branch_id_attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_records_branch_id_attendance_date_idx ON public.attendance_records USING btree (branch_id, attendance_date);


--
-- Name: attendance_records_class_id_section_id_attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_records_class_id_section_id_attendance_date_idx ON public.attendance_records USING btree (class_id, section_id, attendance_date);


--
-- Name: attendance_records_tenant_id_student_id_attendance_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_records_tenant_id_student_id_attendance_date_key ON public.attendance_records USING btree (tenant_id, student_id, attendance_date);


--
-- Name: audit_log_entity_table_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_table_entity_id_idx ON public.audit_log USING btree (entity_table, entity_id);


--
-- Name: audit_log_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_tenant_id_created_at_idx ON public.audit_log USING btree (tenant_id, created_at);


--
-- Name: branches_tenant_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_tenant_id_code_key ON public.branches USING btree (tenant_id, code);


--
-- Name: calendar_holidays_school_calendar_id_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_holidays_school_calendar_id_date_key ON public.calendar_holidays USING btree (school_calendar_id, date);


--
-- Name: calendar_holidays_school_calendar_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_holidays_school_calendar_id_idx ON public.calendar_holidays USING btree (school_calendar_id);


--
-- Name: class_subjects_class_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_subjects_class_id_idx ON public.class_subjects USING btree (class_id);


--
-- Name: class_subjects_class_id_subject_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX class_subjects_class_id_subject_id_key ON public.class_subjects USING btree (class_id, subject_id);


--
-- Name: classes_branch_id_academic_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_branch_id_academic_session_id_idx ON public.classes USING btree (branch_id, academic_session_id);


--
-- Name: exam_marks_exam_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exam_marks_exam_id_idx ON public.exam_marks USING btree (exam_id);


--
-- Name: exam_marks_exam_id_subject_id_student_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exam_marks_exam_id_subject_id_student_id_key ON public.exam_marks USING btree (exam_id, subject_id, student_id);


--
-- Name: exam_marks_student_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exam_marks_student_id_idx ON public.exam_marks USING btree (student_id);


--
-- Name: exams_branch_id_class_id_academic_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exams_branch_id_class_id_academic_session_id_idx ON public.exams USING btree (branch_id, class_id, academic_session_id);


--
-- Name: expenses_branch_id_expense_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_branch_id_expense_date_idx ON public.expenses USING btree (branch_id, expense_date);


--
-- Name: expenses_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_category_id_idx ON public.expenses USING btree (category_id);


--
-- Name: fee_categories_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_categories_tenant_id_idx ON public.fee_categories USING btree (tenant_id);


--
-- Name: fee_categories_tenant_id_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fee_categories_tenant_id_key_key ON public.fee_categories USING btree (tenant_id, key);


--
-- Name: fee_discounts_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_discounts_tenant_id_idx ON public.fee_discounts USING btree (tenant_id);


--
-- Name: fee_discounts_tenant_id_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fee_discounts_tenant_id_key_key ON public.fee_discounts USING btree (tenant_id, key);


--
-- Name: fee_invoice_discounts_fee_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_invoice_discounts_fee_invoice_id_idx ON public.fee_invoice_discounts USING btree (fee_invoice_id);


--
-- Name: fee_invoices_branch_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_invoices_branch_id_status_idx ON public.fee_invoices USING btree (branch_id, status);


--
-- Name: fee_invoices_fee_structure_id_student_id_period_label_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fee_invoices_fee_structure_id_student_id_period_label_key ON public.fee_invoices USING btree (fee_structure_id, student_id, period_label);


--
-- Name: fee_invoices_student_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_invoices_student_id_idx ON public.fee_invoices USING btree (student_id);


--
-- Name: fee_payments_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_payments_invoice_id_idx ON public.fee_payments USING btree (invoice_id);


--
-- Name: fee_payments_tenant_id_receipt_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_payments_tenant_id_receipt_number_idx ON public.fee_payments USING btree (tenant_id, receipt_number);


--
-- Name: fee_structures_branch_id_academic_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_structures_branch_id_academic_session_id_idx ON public.fee_structures USING btree (branch_id, academic_session_id);


--
-- Name: house_point_events_academic_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX house_point_events_academic_session_id_idx ON public.house_point_events USING btree (academic_session_id);


--
-- Name: house_point_events_house_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX house_point_events_house_id_idx ON public.house_point_events USING btree (house_id);


--
-- Name: houses_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX houses_branch_id_idx ON public.houses USING btree (branch_id);


--
-- Name: houses_branch_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX houses_branch_id_name_key ON public.houses USING btree (branch_id, name);


--
-- Name: library_books_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX library_books_branch_id_idx ON public.library_books USING btree (branch_id);


--
-- Name: library_issues_book_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX library_issues_book_id_idx ON public.library_issues USING btree (book_id);


--
-- Name: library_issues_branch_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX library_issues_branch_id_status_idx ON public.library_issues USING btree (branch_id, status);


--
-- Name: library_issues_student_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX library_issues_student_id_idx ON public.library_issues USING btree (student_id);


--
-- Name: master_data_items_tenant_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX master_data_items_tenant_id_type_idx ON public.master_data_items USING btree (tenant_id, type);


--
-- Name: master_data_items_tenant_id_type_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX master_data_items_tenant_id_type_name_key ON public.master_data_items USING btree (tenant_id, type, name);


--
-- Name: module_settings_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX module_settings_branch_id_idx ON public.module_settings USING btree (branch_id);


--
-- Name: module_settings_branch_id_module_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX module_settings_branch_id_module_key_key ON public.module_settings USING btree (branch_id, module_key);


--
-- Name: payroll_runs_branch_id_period_month_period_year_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_runs_branch_id_period_month_period_year_key ON public.payroll_runs USING btree (branch_id, period_month, period_year);


--
-- Name: payroll_runs_branch_id_period_year_period_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_runs_branch_id_period_year_period_month_idx ON public.payroll_runs USING btree (branch_id, period_year, period_month);


--
-- Name: payslip_line_items_payslip_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslip_line_items_payslip_id_idx ON public.payslip_line_items USING btree (payslip_id);


--
-- Name: payslips_payroll_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslips_payroll_run_id_idx ON public.payslips USING btree (payroll_run_id);


--
-- Name: payslips_payroll_run_id_staff_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payslips_payroll_run_id_staff_id_key ON public.payslips USING btree (payroll_run_id, staff_id);


--
-- Name: payslips_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslips_staff_id_idx ON public.payslips USING btree (staff_id);


--
-- Name: period_slots_branch_id_academic_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX period_slots_branch_id_academic_session_id_idx ON public.period_slots USING btree (branch_id, academic_session_id);


--
-- Name: period_slots_branch_id_academic_session_id_sort_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX period_slots_branch_id_academic_session_id_sort_order_key ON public.period_slots USING btree (branch_id, academic_session_id, sort_order);


--
-- Name: promotion_batch_items_promotion_batch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_batch_items_promotion_batch_id_idx ON public.promotion_batch_items USING btree (promotion_batch_id);


--
-- Name: promotion_batch_items_promotion_batch_id_student_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promotion_batch_items_promotion_batch_id_student_id_key ON public.promotion_batch_items USING btree (promotion_batch_id, student_id);


--
-- Name: promotion_batches_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_batches_branch_id_idx ON public.promotion_batches USING btree (branch_id);


--
-- Name: role_permissions_role_id_permission_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_permissions_role_id_permission_key_key ON public.role_permissions USING btree (role_id, permission_key);


--
-- Name: roles_tenant_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_tenant_id_name_key ON public.roles USING btree (tenant_id, name);


--
-- Name: salary_components_salary_structure_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX salary_components_salary_structure_id_idx ON public.salary_components USING btree (salary_structure_id);


--
-- Name: salary_structures_staff_id_effective_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX salary_structures_staff_id_effective_from_idx ON public.salary_structures USING btree (staff_id, effective_from);


--
-- Name: school_calendars_branch_id_academic_session_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX school_calendars_branch_id_academic_session_id_key ON public.school_calendars USING btree (branch_id, academic_session_id);


--
-- Name: sections_class_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sections_class_id_idx ON public.sections USING btree (class_id);


--
-- Name: staff_attendance_branch_id_attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_attendance_branch_id_attendance_date_idx ON public.staff_attendance USING btree (branch_id, attendance_date);


--
-- Name: staff_attendance_staff_id_attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_attendance_staff_id_attendance_date_idx ON public.staff_attendance USING btree (staff_id, attendance_date);


--
-- Name: staff_attendance_tenant_id_staff_id_attendance_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_attendance_tenant_id_staff_id_attendance_date_key ON public.staff_attendance USING btree (tenant_id, staff_id, attendance_date);


--
-- Name: staff_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_branch_id_idx ON public.staff USING btree (branch_id);


--
-- Name: staff_categories_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_categories_tenant_id_idx ON public.staff_categories USING btree (tenant_id);


--
-- Name: staff_categories_tenant_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_categories_tenant_id_name_key ON public.staff_categories USING btree (tenant_id, name);


--
-- Name: staff_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_category_id_idx ON public.staff USING btree (category_id);


--
-- Name: staff_documents_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_documents_staff_id_idx ON public.staff_documents USING btree (staff_id);


--
-- Name: staff_leave_requests_branch_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_leave_requests_branch_id_status_idx ON public.staff_leave_requests USING btree (branch_id, status);


--
-- Name: staff_leave_requests_staff_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_leave_requests_staff_id_status_idx ON public.staff_leave_requests USING btree (staff_id, status);


--
-- Name: staff_tenant_id_employee_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_tenant_id_employee_code_key ON public.staff USING btree (tenant_id, employee_code);


--
-- Name: staff_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_user_id_idx ON public.staff USING btree (user_id);


--
-- Name: student_documents_student_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_documents_student_id_idx ON public.student_documents USING btree (student_id);


--
-- Name: student_elective_choices_student_id_elective_group_id_acade_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_elective_choices_student_id_elective_group_id_acade_key ON public.student_elective_choices USING btree (student_id, elective_group_id, academic_session_id);


--
-- Name: student_elective_choices_student_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_elective_choices_student_id_idx ON public.student_elective_choices USING btree (student_id);


--
-- Name: student_enrollments_academic_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_enrollments_academic_session_id_idx ON public.student_enrollments USING btree (academic_session_id);


--
-- Name: student_enrollments_student_id_academic_session_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_enrollments_student_id_academic_session_id_key ON public.student_enrollments USING btree (student_id, academic_session_id);


--
-- Name: student_fee_assignments_student_id_fee_structure_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_fee_assignments_student_id_fee_structure_id_key ON public.student_fee_assignments USING btree (student_id, fee_structure_id);


--
-- Name: student_fee_discounts_student_id_fee_discount_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_fee_discounts_student_id_fee_discount_id_key ON public.student_fee_discounts USING btree (student_id, fee_discount_id);


--
-- Name: student_guardians_student_id_guardian_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_guardians_student_id_guardian_id_key ON public.student_guardians USING btree (student_id, guardian_id);


--
-- Name: student_guardians_student_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_guardians_student_id_idx ON public.student_guardians USING btree (student_id);


--
-- Name: student_houses_house_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_houses_house_id_idx ON public.student_houses USING btree (house_id);


--
-- Name: student_houses_student_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_houses_student_id_key ON public.student_houses USING btree (student_id);


--
-- Name: student_transport_route_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_transport_route_id_idx ON public.student_transport USING btree (route_id);


--
-- Name: student_transport_student_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_transport_student_id_key ON public.student_transport USING btree (student_id);


--
-- Name: students_current_class_id_current_section_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_current_class_id_current_section_id_idx ON public.students USING btree (current_class_id, current_section_id);


--
-- Name: students_tenant_id_admission_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX students_tenant_id_admission_number_key ON public.students USING btree (tenant_id, admission_number);


--
-- Name: students_tenant_id_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_tenant_id_branch_id_idx ON public.students USING btree (tenant_id, branch_id);


--
-- Name: subject_elective_group_members_elective_group_id_class_subj_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subject_elective_group_members_elective_group_id_class_subj_key ON public.subject_elective_group_members USING btree (elective_group_id, class_subject_id);


--
-- Name: subject_elective_group_members_elective_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_elective_group_members_elective_group_id_idx ON public.subject_elective_group_members USING btree (elective_group_id);


--
-- Name: subject_elective_groups_class_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_elective_groups_class_id_idx ON public.subject_elective_groups USING btree (class_id);


--
-- Name: subject_elective_groups_class_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subject_elective_groups_class_id_name_key ON public.subject_elective_groups USING btree (class_id, name);


--
-- Name: subjects_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subjects_branch_id_idx ON public.subjects USING btree (branch_id);


--
-- Name: teacher_subject_assignments_class_id_section_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teacher_subject_assignments_class_id_section_id_idx ON public.teacher_subject_assignments USING btree (class_id, section_id);


--
-- Name: teacher_subject_assignments_staff_id_class_id_section_id_su_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teacher_subject_assignments_staff_id_class_id_section_id_su_key ON public.teacher_subject_assignments USING btree (staff_id, class_id, section_id, subject_id, academic_session_id);


--
-- Name: teacher_subject_assignments_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teacher_subject_assignments_staff_id_idx ON public.teacher_subject_assignments USING btree (staff_id);


--
-- Name: tenants_subdomain_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_subdomain_key ON public.tenants USING btree (subdomain);


--
-- Name: timetable_entries_section_id_day_of_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_entries_section_id_day_of_week_idx ON public.timetable_entries USING btree (section_id, day_of_week);


--
-- Name: timetable_entries_section_id_day_of_week_period_slot_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timetable_entries_section_id_day_of_week_period_slot_id_key ON public.timetable_entries USING btree (section_id, day_of_week, period_slot_id);


--
-- Name: timetable_entries_staff_id_day_of_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_entries_staff_id_day_of_week_idx ON public.timetable_entries USING btree (staff_id, day_of_week);


--
-- Name: transport_routes_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transport_routes_branch_id_idx ON public.transport_routes USING btree (branch_id);


--
-- Name: transport_stops_route_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transport_stops_route_id_idx ON public.transport_stops USING btree (route_id);


--
-- Name: user_roles_user_id_role_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_roles_user_id_role_id_key ON public.user_roles USING btree (user_id, role_id);


--
-- Name: users_tenant_id_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_tenant_id_email_key ON public.users USING btree (tenant_id, email);


--
-- Name: admissions admissions_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: admissions admissions_applied_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_applied_class_id_fkey FOREIGN KEY (applied_class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: admissions admissions_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: admissions admissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: branches branches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: calendar_holidays calendar_holidays_school_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_holidays
    ADD CONSTRAINT calendar_holidays_school_calendar_id_fkey FOREIGN KEY (school_calendar_id) REFERENCES public.school_calendars(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_subjects class_subjects_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_subjects class_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: classes classes_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: exam_marks exam_marks_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: exam_marks exam_marks_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: exam_marks exam_marks_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: exams exams_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: exams exams_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: exams exams_parent_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_parent_exam_id_fkey FOREIGN KEY (parent_exam_id) REFERENCES public.exams(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_invoice_discounts fee_invoice_discounts_fee_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_discounts
    ADD CONSTRAINT fee_invoice_discounts_fee_discount_id_fkey FOREIGN KEY (fee_discount_id) REFERENCES public.fee_discounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_invoice_discounts fee_invoice_discounts_fee_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoice_discounts
    ADD CONSTRAINT fee_invoice_discounts_fee_invoice_id_fkey FOREIGN KEY (fee_invoice_id) REFERENCES public.fee_invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_invoices fee_invoices_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_invoices fee_invoices_fee_structure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_fee_structure_id_fkey FOREIGN KEY (fee_structure_id) REFERENCES public.fee_structures(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_invoices fee_invoices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_invoices
    ADD CONSTRAINT fee_invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_payments fee_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.fee_invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_payments fee_payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: fee_structures fee_structures_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: fee_structures fee_structures_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: house_point_events house_point_events_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.house_point_events
    ADD CONSTRAINT house_point_events_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: house_point_events house_point_events_awarded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.house_point_events
    ADD CONSTRAINT house_point_events_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: house_point_events house_point_events_house_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.house_point_events
    ADD CONSTRAINT house_point_events_house_id_fkey FOREIGN KEY (house_id) REFERENCES public.houses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: house_point_events house_point_events_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.house_point_events
    ADD CONSTRAINT house_point_events_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: library_issues library_issues_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues
    ADD CONSTRAINT library_issues_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.library_books(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: library_issues library_issues_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues
    ADD CONSTRAINT library_issues_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: library_issues library_issues_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_issues
    ADD CONSTRAINT library_issues_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_runs payroll_runs_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payslip_line_items payslip_line_items_payslip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslip_line_items
    ADD CONSTRAINT payslip_line_items_payslip_id_fkey FOREIGN KEY (payslip_id) REFERENCES public.payslips(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payslips payslips_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payslips payslips_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: period_slots period_slots_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_slots
    ADD CONSTRAINT period_slots_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: promotion_batch_items promotion_batch_items_from_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batch_items
    ADD CONSTRAINT promotion_batch_items_from_class_id_fkey FOREIGN KEY (from_class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: promotion_batch_items promotion_batch_items_from_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batch_items
    ADD CONSTRAINT promotion_batch_items_from_section_id_fkey FOREIGN KEY (from_section_id) REFERENCES public.sections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: promotion_batch_items promotion_batch_items_promotion_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batch_items
    ADD CONSTRAINT promotion_batch_items_promotion_batch_id_fkey FOREIGN KEY (promotion_batch_id) REFERENCES public.promotion_batches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: promotion_batch_items promotion_batch_items_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batch_items
    ADD CONSTRAINT promotion_batch_items_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: promotion_batch_items promotion_batch_items_to_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batch_items
    ADD CONSTRAINT promotion_batch_items_to_class_id_fkey FOREIGN KEY (to_class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: promotion_batch_items promotion_batch_items_to_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batch_items
    ADD CONSTRAINT promotion_batch_items_to_section_id_fkey FOREIGN KEY (to_section_id) REFERENCES public.sections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: promotion_batches promotion_batches_executed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batches
    ADD CONSTRAINT promotion_batches_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: promotion_batches promotion_batches_from_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batches
    ADD CONSTRAINT promotion_batches_from_session_id_fkey FOREIGN KEY (from_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: promotion_batches promotion_batches_to_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_batches
    ADD CONSTRAINT promotion_batches_to_session_id_fkey FOREIGN KEY (to_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: roles roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: salary_components salary_components_salary_structure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_salary_structure_id_fkey FOREIGN KEY (salary_structure_id) REFERENCES public.salary_structures(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: salary_structures salary_structures_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_structures
    ADD CONSTRAINT salary_structures_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: school_calendars school_calendars_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_calendars
    ADD CONSTRAINT school_calendars_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sections sections_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sections sections_class_teacher_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_class_teacher_staff_id_fkey FOREIGN KEY (class_teacher_staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_attendance staff_attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_attendance staff_attendance_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: staff staff_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.staff_categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_documents staff_documents_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: staff_documents staff_documents_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: staff_leave_requests staff_leave_requests_decided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_leave_requests staff_leave_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: staff_leave_requests staff_leave_requests_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: staff staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: student_documents student_documents_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_documents
    ADD CONSTRAINT student_documents_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_documents student_documents_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_documents
    ADD CONSTRAINT student_documents_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_elective_choices student_elective_choices_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_elective_choices
    ADD CONSTRAINT student_elective_choices_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_elective_choices student_elective_choices_elective_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_elective_choices
    ADD CONSTRAINT student_elective_choices_elective_group_id_fkey FOREIGN KEY (elective_group_id) REFERENCES public.subject_elective_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_elective_choices student_elective_choices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_elective_choices
    ADD CONSTRAINT student_elective_choices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_elective_choices student_elective_choices_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_elective_choices
    ADD CONSTRAINT student_elective_choices_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_enrollments student_enrollments_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollments
    ADD CONSTRAINT student_enrollments_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_enrollments student_enrollments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollments
    ADD CONSTRAINT student_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_enrollments student_enrollments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollments
    ADD CONSTRAINT student_enrollments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: student_enrollments student_enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollments
    ADD CONSTRAINT student_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_fee_assignments student_fee_assignments_fee_structure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_assignments
    ADD CONSTRAINT student_fee_assignments_fee_structure_id_fkey FOREIGN KEY (fee_structure_id) REFERENCES public.fee_structures(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_fee_assignments student_fee_assignments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_assignments
    ADD CONSTRAINT student_fee_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_fee_discounts student_fee_discounts_fee_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_discounts
    ADD CONSTRAINT student_fee_discounts_fee_discount_id_fkey FOREIGN KEY (fee_discount_id) REFERENCES public.fee_discounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_fee_discounts student_fee_discounts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_discounts
    ADD CONSTRAINT student_fee_discounts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_guardians student_guardians_guardian_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES public.guardians(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_guardians student_guardians_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_houses student_houses_house_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_houses
    ADD CONSTRAINT student_houses_house_id_fkey FOREIGN KEY (house_id) REFERENCES public.houses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_houses student_houses_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_houses
    ADD CONSTRAINT student_houses_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_transport student_transport_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transport
    ADD CONSTRAINT student_transport_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.transport_routes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_transport student_transport_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transport
    ADD CONSTRAINT student_transport_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transport_stops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: student_transport student_transport_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transport
    ADD CONSTRAINT student_transport_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: students students_current_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_current_class_id_fkey FOREIGN KEY (current_class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: students students_current_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_current_section_id_fkey FOREIGN KEY (current_section_id) REFERENCES public.sections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: subject_elective_group_members subject_elective_group_members_class_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_elective_group_members
    ADD CONSTRAINT subject_elective_group_members_class_subject_id_fkey FOREIGN KEY (class_subject_id) REFERENCES public.class_subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subject_elective_group_members subject_elective_group_members_elective_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_elective_group_members
    ADD CONSTRAINT subject_elective_group_members_elective_group_id_fkey FOREIGN KEY (elective_group_id) REFERENCES public.subject_elective_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subject_elective_groups subject_elective_groups_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_elective_groups
    ADD CONSTRAINT subject_elective_groups_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: teacher_subject_assignments teacher_subject_assignments_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subject_assignments
    ADD CONSTRAINT teacher_subject_assignments_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: teacher_subject_assignments teacher_subject_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subject_assignments
    ADD CONSTRAINT teacher_subject_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: teacher_subject_assignments teacher_subject_assignments_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subject_assignments
    ADD CONSTRAINT teacher_subject_assignments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: teacher_subject_assignments teacher_subject_assignments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subject_assignments
    ADD CONSTRAINT teacher_subject_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: teacher_subject_assignments teacher_subject_assignments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subject_assignments
    ADD CONSTRAINT teacher_subject_assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timetable_entries timetable_entries_academic_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_academic_session_id_fkey FOREIGN KEY (academic_session_id) REFERENCES public.academic_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timetable_entries timetable_entries_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timetable_entries timetable_entries_period_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_period_slot_id_fkey FOREIGN KEY (period_slot_id) REFERENCES public.period_slots(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timetable_entries timetable_entries_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timetable_entries timetable_entries_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timetable_entries timetable_entries_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: transport_stops transport_stops_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_stops
    ADD CONSTRAINT transport_stops_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.transport_routes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--



-- Down Migration

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
