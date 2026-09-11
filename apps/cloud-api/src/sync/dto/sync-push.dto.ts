import { Type } from "class-transformer";
import { IsArray, IsIn, IsObject, IsString, ValidateNested } from "class-validator";

export const SYNCABLE_TABLES = [
  "branches",
  "users",
  "roles",
  "user_roles",
  "academic_sessions",
  "classes",
  "sections",
  "students",
  "guardians",
  "student_guardians",
  "admissions",
  "attendance_records",
  "fee_structures",
  "fee_invoices",
  "fee_payments",
  "subjects",
  "exams",
  "exam_marks",
  "module_settings",
  "houses",
  "student_houses",
  "house_point_events",
  "library_books",
  "library_issues",
  "transport_routes",
  "transport_stops",
  "student_transport",
] as const;

export class SyncChangeDto {
  @IsIn(SYNCABLE_TABLES)
  entity_table!: (typeof SYNCABLE_TABLES)[number];

  @IsString()
  entity_id!: string;

  @IsIn(["insert", "update", "delete"])
  op!: "insert" | "update" | "delete";

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  client_ts!: string;
}

export class SyncPushDto {
  @IsString()
  tenant_id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncChangeDto)
  changes!: SyncChangeDto[];
}
