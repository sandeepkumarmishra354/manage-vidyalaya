import { IsInt, IsOptional, IsString } from "class-validator";

export class RecordPaymentDto {
  @IsString()
  invoice_id!: string;

  @IsInt()
  amount!: number;

  @IsString()
  payment_method!: string;

  @IsString()
  payment_date!: string;

  @IsOptional()
  @IsString()
  receipt_number?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}
