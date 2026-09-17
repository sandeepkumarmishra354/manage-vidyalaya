import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateExpenseDto {
  @IsString()
  branch_id!: string;

  @IsOptional()
  @IsString()
  category_id?: string | null;

  @IsString()
  description!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  expense_date!: string;

  @IsOptional()
  @IsString()
  payment_mode?: string | null;

  @IsOptional()
  @IsString()
  vendor_name?: string | null;
}
