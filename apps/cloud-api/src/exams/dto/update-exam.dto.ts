import { IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateExamDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  exam_date?: string | null;

  @IsNumber()
  passing_percentage!: number;
}
