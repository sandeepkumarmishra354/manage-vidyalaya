import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class AssignDiscountDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  student_ids!: string[];

  @IsOptional()
  @IsString()
  reason?: string | null;

  // Explicit choice at assignment time -- never an implicit default either
  // way. When true, recomputes this discount into the student's
  // non-voided, pending/partial invoices for the *current session only*.
  @IsBoolean()
  apply_to_existing_invoices!: boolean;
}
