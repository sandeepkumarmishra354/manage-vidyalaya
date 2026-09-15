import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, ValidateNested } from "class-validator";

export class RecordPaymentBatchEntryDto {
  @IsString()
  invoice_id!: string;

  // Explicit per-invoice amount -- no auto-allocation across invoices.
  @IsInt()
  amount!: number;
}

export class RecordPaymentBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecordPaymentBatchEntryDto)
  entries!: RecordPaymentBatchEntryDto[];

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
