import { IsIn, IsString } from "class-validator";

export class CreateHolidayRangeDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsString()
  start_date!: string;

  @IsString()
  end_date!: string;

  @IsString()
  name!: string;

  @IsIn(["holiday", "half_day"])
  type!: "holiday" | "half_day";
}
