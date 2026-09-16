import { IsArray, IsInt, IsString, Max, Min } from "class-validator";

export class SetWeeklyRuleDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  // Day-of-week values, 0=Sunday..6=Saturday (matches JS Date.getUTCDay()).
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekly_off_days!: number[];

  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekly_half_days!: number[];
}
