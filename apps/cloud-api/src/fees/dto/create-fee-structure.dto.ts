import { IsIn, IsInt, IsOptional, IsString } from "class-validator";

import { FEE_TYPES, type FeeType } from "../fee-type.js";

export class CreateFeeStructureDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsOptional()
  @IsString()
  class_id?: string | null;

  @IsString()
  name!: string;

  @IsInt()
  amount!: number;

  @IsString()
  frequency!: string;

  @IsOptional()
  @IsIn(FEE_TYPES)
  fee_type?: FeeType;
}
