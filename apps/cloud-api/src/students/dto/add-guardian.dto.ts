import { IsBoolean, IsInt, IsOptional, IsString, ValidateIf } from "class-validator";

// Either link an existing guardian (guardian_id) or create a new one from
// the fields below -- full_name is required only when guardian_id is absent.
export class AddGuardianDto {
  @IsOptional()
  @IsString()
  guardian_id?: string | null;

  @IsString()
  relation!: string;

  @IsOptional()
  @IsBoolean()
  is_primary_contact?: boolean;

  @ValidateIf((o: AddGuardianDto) => !o.guardian_id)
  @IsString()
  full_name?: string;

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
