import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class SaveMarksEntryDto {
  @IsString()
  student_id!: string;

  @IsInt()
  max_marks!: number;

  @IsOptional()
  @IsNumber()
  marks_obtained?: number | null;

  @IsBoolean()
  is_absent!: boolean;

  // Explicit teacher override of the auto-computed pass/fail/grace result.
  // Always wins over the computed value when present.
  @IsOptional()
  @IsIn(["pass", "fail", "grace"])
  override_result?: "pass" | "fail" | "grace" | null;
}

export class SaveMarksDto {
  @IsString()
  exam_id!: string;

  @IsString()
  subject_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaveMarksEntryDto)
  entries!: SaveMarksEntryDto[];
}
