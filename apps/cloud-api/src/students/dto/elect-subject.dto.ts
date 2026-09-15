import { IsString } from "class-validator";

export class ElectSubjectDto {
  @IsString()
  elective_group_id!: string;

  @IsString()
  subject_id!: string;

  @IsString()
  academic_session_id!: string;
}
