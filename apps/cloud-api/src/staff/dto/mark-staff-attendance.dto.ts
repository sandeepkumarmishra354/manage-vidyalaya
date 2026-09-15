import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

export class MarkStaffAttendanceEntryDto {
  @IsString()
  staff_id!: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class MarkStaffAttendanceDto {
  @IsString()
  branch_id!: string;

  @IsString()
  attendance_date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkStaffAttendanceEntryDto)
  entries!: MarkStaffAttendanceEntryDto[];
}
