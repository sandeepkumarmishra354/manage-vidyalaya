import { IsNumber, IsOptional, IsString } from "class-validator";

export class CreateExamDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsString()
  class_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  exam_date?: string | null;

  @IsOptional()
  @IsString()
  exam_type?: string | null;

  @IsOptional()
  @IsString()
  parent_exam_id?: string | null;

  @IsOptional()
  @IsNumber()
  passing_percentage?: number;
}
