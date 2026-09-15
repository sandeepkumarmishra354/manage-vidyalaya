import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateFeeStructureDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsOptional()
  @IsString()
  class_id?: string | null;

  @IsString()
  name!: string;

  @IsInt()
  amount!: number;

  @IsString()
  frequency!: string;
}
