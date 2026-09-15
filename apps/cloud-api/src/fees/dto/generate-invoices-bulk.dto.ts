import { IsArray, IsOptional, IsString } from "class-validator";

export class GenerateInvoicesBulkDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  // Omit to mean "every active fee structure for this branch+session".
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fee_structure_ids?: string[];
}
