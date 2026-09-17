import { IsInt, IsOptional, IsString } from "class-validator";

// Implemented as reverse-then-reapply in one transaction -- the corrected
// row keeps the original receipt_number, so a reprint after an edit still
// shows one consistent receipt.
export class EditPaymentDto {
  @IsInt()
  amount!: number;

  @IsString()
  payment_method!: string;

  @IsString()
  payment_date!: string;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsString()
  reason!: string;
}
