import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

export class BulkMarkStaffAttendanceEntryDto {
  @IsString()
  staff_id!: string;

  @IsString()
  attendance_date!: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

// Unlike MarkStaffAttendanceDto, entries each carry their own
// attendance_date -- the calendar/month-grid bulk-save shape, spanning many
// dates in one request rather than one date at a time.
export class BulkMarkStaffAttendanceDto {
  @IsString()
  branch_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkMarkStaffAttendanceEntryDto)
  entries!: BulkMarkStaffAttendanceEntryDto[];
}
