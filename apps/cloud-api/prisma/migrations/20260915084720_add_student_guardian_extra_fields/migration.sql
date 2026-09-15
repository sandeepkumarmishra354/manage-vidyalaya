-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "email" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "fee_structures" ADD COLUMN     "fee_type" TEXT NOT NULL DEFAULT 'tuition';

-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "aadhaar_number" TEXT,
ADD COLUMN     "annual_income" INTEGER;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "aadhaar_number" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "medical_notes" TEXT,
ADD COLUMN     "mother_tongue" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "previous_school_name" TEXT,
ADD COLUMN     "religion" TEXT;
