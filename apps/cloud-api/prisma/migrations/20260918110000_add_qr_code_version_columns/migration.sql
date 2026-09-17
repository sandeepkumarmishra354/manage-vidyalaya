-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "qr_code_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "qr_code_version" INTEGER NOT NULL DEFAULT 1;

