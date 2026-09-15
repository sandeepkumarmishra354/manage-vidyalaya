import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

export class BulkMarkAttendanceEntryDto {
  @IsString()
  student_id!: string;

  @IsString()
  attendance_date!: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

// Unlike MarkAttendanceDto, entries each carry their own attendance_date --
// this is the calendar/month-grid bulk-save shape, spanning many dates in
// one request rather than one date at a time.
export class BulkMarkAttendanceDto {
  @IsString()
  branch_id!: string;

  @IsString()
  class_id!: string;

  @IsOptional()
  @IsString()
  section_id?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkMarkAttendanceEntryDto)
  entries!: BulkMarkAttendanceEntryDto[];
}
