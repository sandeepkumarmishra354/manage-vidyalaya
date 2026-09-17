import { IsOptional, IsString } from "class-validator";

export class ApplyStaffLeaveDto {
  @IsString()
  start_date!: string;

  @IsString()
  end_date!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
