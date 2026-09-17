import { IsIn, IsOptional, IsString } from "class-validator";

import { STAFF_STATUS_VALUES } from "../staff-status.js";

export class SetStaffStatusDto {
  @IsIn(STAFF_STATUS_VALUES)
  status!: string;

  @IsOptional()
  @IsString()
  date_of_leaving?: string | null;
}
