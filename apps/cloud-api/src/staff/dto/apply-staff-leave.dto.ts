import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ApplyStaffLeaveDto {
  @IsString()
  start_date!: string;

  @IsString()
  end_date!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  // Only valid when start_date === end_date -- enforced in StaffLeaveService.
  @IsOptional()
  @IsBoolean()
  is_half_day?: boolean;
}
