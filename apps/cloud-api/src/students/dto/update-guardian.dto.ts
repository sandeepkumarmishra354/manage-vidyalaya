import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateGuardianDto {
  @IsString()
  full_name!: string;

  @IsOptional()
  @IsString()
  relation?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  alt_phone?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  occupation?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  aadhaar_number?: string | null;

  @IsOptional()
  @IsInt()
  annual_income?: number | null;
}
