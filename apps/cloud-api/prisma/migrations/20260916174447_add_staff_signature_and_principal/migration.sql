-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "is_principal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signature_url" TEXT;
