import { IsOptional, IsString } from "class-validator";

export class CreateTeacherAssignmentDto {
  @IsString()
  branch_id!: string;

  @IsString()
  staff_id!: string;

  @IsString()
  class_id!: string;

  @IsOptional()
  @IsString()
  section_id?: string | null;

  @IsString()
  subject_id!: string;

  @IsString()
  academic_session_id!: string;
}
