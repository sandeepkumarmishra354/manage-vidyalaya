import { IsInt, IsOptional, IsString } from "class-validator";

export class AwardPointsDto {
  @IsString()
  branch_id!: string;

  @IsString()
  house_id!: string;

  @IsOptional()
  @IsString()
  student_id?: string | null;

  @IsOptional()
  @IsString()
  academic_session_id?: string | null;

  @IsInt()
  points!: number;

  @IsString()
  reason!: string;

  @IsString()
  event_date!: string;
}
