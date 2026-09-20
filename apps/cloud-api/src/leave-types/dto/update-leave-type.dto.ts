import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  quota_enabled?: boolean;
}
