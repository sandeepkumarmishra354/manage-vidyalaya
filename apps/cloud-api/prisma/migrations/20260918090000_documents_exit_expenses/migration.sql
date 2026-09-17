-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "conduct_remark" TEXT,
ADD COLUMN     "experience_letter_issue_date" TIMESTAMP(3),
ADD COLUMN     "experience_letter_number" TEXT,
ADD COLUMN     "reason_for_leaving" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "alumni_contact_email" TEXT,
ADD COLUMN     "alumni_notes" TEXT,
ADD COLUMN     "conduct_remark" TEXT,
ADD COLUMN     "current_occupation" TEXT,
ADD COLUMN     "date_of_leaving" TIMESTAMP(3),
ADD COLUMN     "graduation_year" INTEGER,
ADD COLUMN     "higher_education" TEXT,
ADD COLUMN     "reason_for_leaving" TEXT,
ADD COLUMN     "tc_issue_date" TIMESTAMP(3),
ADD COLUMN     "tc_number" TEXT;

-- CreateTable
CREATE TABLE "student_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "category_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "payment_mode" TEXT,
    "vendor_name" TEXT,
    "receipt_storage_key" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_documents_student_id_idx" ON "student_documents"("student_id");

-- CreateIndex
CREATE INDEX "staff_documents_staff_id_idx" ON "staff_documents"("staff_id");

-- CreateIndex
CREATE INDEX "expenses_branch_id_expense_date_idx" ON "expenses"("branch_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

