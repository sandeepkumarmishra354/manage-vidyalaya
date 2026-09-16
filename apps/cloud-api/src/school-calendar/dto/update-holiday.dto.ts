import { IsIn, IsString } from "class-validator";

export class UpdateHolidayDto {
  @IsString()
  date!: string;

  @IsString()
  name!: string;

  @IsIn(["holiday", "half_day"])
  type!: "holiday" | "half_day";
}
