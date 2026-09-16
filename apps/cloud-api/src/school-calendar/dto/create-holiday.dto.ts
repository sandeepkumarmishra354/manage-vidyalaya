import { IsIn, IsString } from "class-validator";

export class CreateHolidayDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsString()
  date!: string;

  @IsString()
  name!: string;

  @IsIn(["holiday", "half_day"])
  type!: "holiday" | "half_day";
}
