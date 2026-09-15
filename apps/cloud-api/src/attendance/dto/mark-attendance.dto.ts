import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

export class MarkAttendanceEntryDto {
  @IsString()
  student_id!: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class MarkAttendanceDto {
  @IsString()
  branch_id!: string;

  @IsString()
  class_id!: string;

  @IsOptional()
  @IsString()
  section_id?: string | null;

  @IsString()
  attendance_date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceEntryDto)
  entries!: MarkAttendanceEntryDto[];
}
