-- AlterTable
ALTER TABLE "exam_marks" ADD COLUMN     "result" TEXT;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "results_published_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "category_id" TEXT;

-- CreateTable
CREATE TABLE "fee_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fee_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subjects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "is_elective" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_elective_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "subject_elective_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_elective_group_members" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "elective_group_id" TEXT NOT NULL,
    "class_subject_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "subject_elective_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_elective_choices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "elective_group_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_elective_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "staff_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_categories_tenant_id_idx" ON "fee_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_categories_tenant_id_key_key" ON "fee_categories"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "class_subjects_class_id_idx" ON "class_subjects"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_subjects_class_id_subject_id_key" ON "class_subjects"("class_id", "subject_id");

-- CreateIndex
CREATE INDEX "subject_elective_groups_class_id_idx" ON "subject_elective_groups"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_elective_groups_class_id_name_key" ON "subject_elective_groups"("class_id", "name");

-- CreateIndex
CREATE INDEX "subject_elective_group_members_elective_group_id_idx" ON "subject_elective_group_members"("elective_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_elective_group_members_elective_group_id_class_subj_key" ON "subject_elective_group_members"("elective_group_id", "class_subject_id");

-- CreateIndex
CREATE INDEX "student_elective_choices_student_id_idx" ON "student_elective_choices"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_elective_choices_student_id_elective_group_id_acade_key" ON "student_elective_choices"("student_id", "elective_group_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "staff_categories_tenant_id_idx" ON "staff_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_categories_tenant_id_name_key" ON "staff_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "staff_category_id_idx" ON "staff"("category_id");

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_elective_groups" ADD CONSTRAINT "subject_elective_groups_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_elective_group_members" ADD CONSTRAINT "subject_elective_group_members_elective_group_id_fkey" FOREIGN KEY ("elective_group_id") REFERENCES "subject_elective_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_elective_group_members" ADD CONSTRAINT "subject_elective_group_members_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_elective_choices" ADD CONSTRAINT "student_elective_choices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_elective_choices" ADD CONSTRAINT "student_elective_choices_elective_group_id_fkey" FOREIGN KEY ("elective_group_id") REFERENCES "subject_elective_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_elective_choices" ADD CONSTRAINT "student_elective_choices_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_elective_choices" ADD CONSTRAINT "student_elective_choices_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "staff_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
