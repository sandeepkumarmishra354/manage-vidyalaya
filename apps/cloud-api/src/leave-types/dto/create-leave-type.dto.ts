import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateLeaveTypeDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  quota_enabled?: boolean;
}
