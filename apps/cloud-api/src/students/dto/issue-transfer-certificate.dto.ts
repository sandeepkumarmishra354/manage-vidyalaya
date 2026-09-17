import { IsOptional, IsString } from "class-validator";

export class IssueTransferCertificateDto {
  @IsString()
  reason_for_leaving!: string;

  @IsString()
  date_of_leaving!: string;

  @IsOptional()
  @IsString()
  conduct_remark?: string | null;
}
