-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "signature_url" TEXT;

-- AlterTable
ALTER TABLE "payslips" ALTER COLUMN "days_in_month" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "school_calendars" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "weekly_off_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "weekly_half_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "school_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_holidays" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "school_calendar_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "calendar_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_calendars_branch_id_academic_session_id_key" ON "school_calendars"("branch_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "calendar_holidays_school_calendar_id_idx" ON "calendar_holidays"("school_calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_holidays_school_calendar_id_date_key" ON "calendar_holidays"("school_calendar_id", "date");

-- AddForeignKey
ALTER TABLE "school_calendars" ADD CONSTRAINT "school_calendars_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_holidays" ADD CONSTRAINT "calendar_holidays_school_calendar_id_fkey" FOREIGN KEY ("school_calendar_id") REFERENCES "school_calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
