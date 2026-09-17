import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreatePeriodSlotDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  sort_order!: number;

  @Matches(TIME_PATTERN, { message: "start_time must be in HH:mm format" })
  start_time!: string;

  @Matches(TIME_PATTERN, { message: "end_time must be in HH:mm format" })
  end_time!: string;

  @IsOptional()
  @IsIn(["teaching", "break", "lunch"])
  period_type?: string;
}
