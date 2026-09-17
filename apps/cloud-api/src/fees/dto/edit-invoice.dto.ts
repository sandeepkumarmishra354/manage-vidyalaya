import { IsInt, IsOptional, IsString } from "class-validator";

export class EditInvoiceDto {
  @IsInt()
  amount_due!: number;

  @IsOptional()
  @IsString()
  due_date?: string | null;

  @IsString()
  reason!: string;
}
