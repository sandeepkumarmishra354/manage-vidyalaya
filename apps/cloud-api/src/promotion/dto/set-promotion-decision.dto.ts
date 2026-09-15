import { IsIn, IsOptional, IsString } from "class-validator";

export class SetPromotionDecisionDto {
  @IsIn(["promote", "retain", "withdraw"])
  decision!: string;

  @IsOptional()
  @IsString()
  to_class_id?: string | null;

  @IsOptional()
  @IsString()
  to_section_id?: string | null;
}
