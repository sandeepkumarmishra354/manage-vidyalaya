-- CreateTable
CREATE TABLE "period_slots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "period_type" TEXT NOT NULL DEFAULT 'teaching',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "period_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "period_slot_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "room_name" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_slots_branch_id_academic_session_id_idx" ON "period_slots"("branch_id", "academic_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_slots_branch_id_academic_session_id_sort_order_key" ON "period_slots"("branch_id", "academic_session_id", "sort_order");

-- CreateIndex
CREATE INDEX "timetable_entries_staff_id_day_of_week_idx" ON "timetable_entries"("staff_id", "day_of_week");

-- CreateIndex
CREATE INDEX "timetable_entries_section_id_day_of_week_idx" ON "timetable_entries"("section_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_section_id_day_of_week_period_slot_id_key" ON "timetable_entries"("section_id", "day_of_week", "period_slot_id");

-- AddForeignKey
ALTER TABLE "period_slots" ADD CONSTRAINT "period_slots_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_period_slot_id_fkey" FOREIGN KEY ("period_slot_id") REFERENCES "period_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

