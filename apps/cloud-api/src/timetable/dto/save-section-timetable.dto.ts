import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

export class SectionTimetableEntryDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week!: number;

  @IsString()
  period_slot_id!: string;

  @IsString()
  subject_id!: string;

  @IsString()
  staff_id!: string;

  @IsOptional()
  @IsString()
  room_name?: string | null;
}

export class SaveSectionTimetableDto {
  @IsString()
  branch_id!: string;

  @IsString()
  class_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => SectionTimetableEntryDto)
  entries!: SectionTimetableEntryDto[];
}
