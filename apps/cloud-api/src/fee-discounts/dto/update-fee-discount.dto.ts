import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from "class-validator";

export class UpdateFeeDiscountDto {
  @IsString()
  name!: string;

  @IsIn(["percentage", "flat"])
  discount_type!: "percentage" | "flat";

  @IsInt()
  value!: number;

  @IsOptional()
  @IsString()
  fee_category_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  valid_from?: string | null;

  @IsOptional()
  @IsString()
  valid_to?: string | null;
}
