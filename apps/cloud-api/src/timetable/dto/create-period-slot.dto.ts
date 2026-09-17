import { IsIn, IsOptional, IsString, Matches } from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// sort_order is deliberately not client-supplied here -- the service
// derives it itself (see TimetableService.createPeriodSlot), since a
// client-computed value can't be trusted not to collide with another
// slot (including a soft-deleted one still holding its old value).
export class CreatePeriodSlotDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsString()
  name!: string;

  @Matches(TIME_PATTERN, { message: "start_time must be in HH:mm format" })
  start_time!: string;

  @Matches(TIME_PATTERN, { message: "end_time must be in HH:mm format" })
  end_time!: string;

  @IsOptional()
  @IsIn(["teaching", "break", "lunch"])
  period_type?: string;
}
