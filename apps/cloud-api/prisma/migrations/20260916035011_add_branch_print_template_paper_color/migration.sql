-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "print_paper_color" TEXT NOT NULL DEFAULT 'white',
ADD COLUMN     "print_template" TEXT NOT NULL DEFAULT 'classic';
