import { IsIn, IsInt, IsOptional, IsString } from "class-validator";

export class CreateFeeDiscountDto {
  @IsString()
  name!: string;

  @IsIn(["percentage", "flat"])
  discount_type!: "percentage" | "flat";

  // A percentage (0-100) or a flat paise amount, per discount_type.
  @IsInt()
  value!: number;

  // Scope to one fee category (e.g. only tuition), or omit for "any fee".
  @IsOptional()
  @IsString()
  fee_category_id?: string | null;

  @IsOptional()
  @IsString()
  valid_from?: string | null;

  @IsOptional()
  @IsString()
  valid_to?: string | null;
}
