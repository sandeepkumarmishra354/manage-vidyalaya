import { IsOptional, IsString } from "class-validator";

// HR/admin filing leave on behalf of a staff member -- same shape as
// ApplyStaffLeaveDto plus the target staff_id, since the caller isn't
// necessarily the staff member themselves.
export class FileStaffLeaveDto {
  @IsString()
  staff_id!: string;

  @IsString()
  start_date!: string;

  @IsString()
  end_date!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
