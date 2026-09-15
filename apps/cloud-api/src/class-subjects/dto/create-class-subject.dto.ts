import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateClassSubjectDto {
  @IsString()
  subject_id!: string;

  @IsOptional()
  @IsBoolean()
  is_elective?: boolean;
}
