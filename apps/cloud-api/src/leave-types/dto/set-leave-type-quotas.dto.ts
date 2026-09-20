import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class LeaveTypeQuotaEntryDto {
  // null = the fallback quota for a staff category with no row of its own
  // (including staff with no category assigned).
  @IsOptional()
  @IsString()
  staff_category_id?: string | null;

  @IsNumber()
  @Min(0)
  monthly_accrual_days!: number;
}

export class SetLeaveTypeQuotasDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LeaveTypeQuotaEntryDto)
  quotas!: LeaveTypeQuotaEntryDto[];
}
