-- CreateTable
CREATE TABLE "master_data_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "master_data_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_data_items_tenant_id_type_idx" ON "master_data_items"("tenant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "master_data_items_tenant_id_type_name_key" ON "master_data_items"("tenant_id", "type", "name");
