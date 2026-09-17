-- DropForeignKey
ALTER TABLE "fee_structures" DROP CONSTRAINT "fee_structures_academic_session_id_fkey";

-- AlterTable
ALTER TABLE "fee_invoices" ADD COLUMN     "discount_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gross_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "period_label" TEXT NOT NULL DEFAULT '';

-- Backfill: every existing invoice predates discounts, so its gross amount
-- equals what was already due.
UPDATE "fee_invoices" SET "gross_amount" = "amount_due";

-- AlterTable
ALTER TABLE "fee_structures" ALTER COLUMN "academic_session_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "student_fee_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_structure_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_discounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "fee_category_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_discounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_discount_id" TEXT NOT NULL,
    "reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoice_discounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "fee_invoice_id" TEXT NOT NULL,
    "fee_discount_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoice_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_assignments_student_id_fee_structure_id_key" ON "student_fee_assignments"("student_id", "fee_structure_id");

-- CreateIndex
CREATE INDEX "fee_discounts_tenant_id_idx" ON "fee_discounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_discounts_tenant_id_key_key" ON "fee_discounts"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_discounts_student_id_fee_discount_id_key" ON "student_fee_discounts"("student_id", "fee_discount_id");

-- CreateIndex
CREATE INDEX "fee_invoice_discounts_fee_invoice_id_idx" ON "fee_invoice_discounts"("fee_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_fee_structure_id_student_id_period_label_key" ON "fee_invoices"("fee_structure_id", "student_id", "period_label");

-- CreateIndex
CREATE INDEX "fee_payments_tenant_id_receipt_number_idx" ON "fee_payments"("tenant_id", "receipt_number");

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_discounts" ADD CONSTRAINT "student_fee_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_discounts" ADD CONSTRAINT "student_fee_discounts_fee_discount_id_fkey" FOREIGN KEY ("fee_discount_id") REFERENCES "fee_discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoice_discounts" ADD CONSTRAINT "fee_invoice_discounts_fee_invoice_id_fkey" FOREIGN KEY ("fee_invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoice_discounts" ADD CONSTRAINT "fee_invoice_discounts_fee_discount_id_fkey" FOREIGN KEY ("fee_discount_id") REFERENCES "fee_discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

