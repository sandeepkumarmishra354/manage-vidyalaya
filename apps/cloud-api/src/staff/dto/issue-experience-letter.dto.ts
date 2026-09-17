import { IsOptional, IsString } from "class-validator";

export class IssueExperienceLetterDto {
  @IsString()
  reason_for_leaving!: string;

  @IsString()
  date_of_leaving!: string;

  @IsOptional()
  @IsString()
  conduct_remark?: string | null;
}
