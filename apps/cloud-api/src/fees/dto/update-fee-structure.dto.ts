import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateFeeStructureDto {
  @IsString()
  name!: string;

  @IsInt()
  amount!: number;

  @IsString()
  frequency!: string;

  // Validated against the tenant's FeeCategory list in FeesService, not a
  // static enum -- fee categories are tenant-extensible.
  @IsString()
  fee_type!: string;

  @IsOptional()
  @IsString()
  class_id?: string | null;
}
