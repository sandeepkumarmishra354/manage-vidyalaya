import { IsIn, IsInt, IsOptional, IsString } from "class-validator";

import { FEE_TYPES, type FeeType } from "../fee-type.js";

export class UpdateFeeStructureDto {
  @IsString()
  name!: string;

  @IsInt()
  amount!: number;

  @IsString()
  frequency!: string;

  @IsIn(FEE_TYPES)
  fee_type!: FeeType;

  @IsOptional()
  @IsString()
  class_id?: string | null;
}
