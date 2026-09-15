import { IsInt, IsOptional, IsString, ValidateIf } from "class-validator";

export class CreateAdmissionDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsOptional()
  @IsString()
  applied_class_id?: string | null;

  @IsString()
  first_name!: string;

  @IsOptional()
  @IsString()
  last_name?: string | null;

  @IsOptional()
  @IsString()
  date_of_birth?: string | null;

  @IsOptional()
  @IsString()
  gender?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  religion?: string | null;

  @IsOptional()
  @IsString()
  nationality?: string | null;

  @IsOptional()
  @IsString()
  mother_tongue?: string | null;

  @IsOptional()
  @IsString()
  aadhaar_number?: string | null;

  @IsOptional()
  @IsString()
  previous_school_name?: string | null;

  @IsOptional()
  @IsString()
  medical_notes?: string | null;

  @IsOptional()
  @IsString()
  emergency_contact_name?: string | null;

  @IsOptional()
  @IsString()
  emergency_contact_phone?: string | null;

  // Guardian: either link an existing guardian (guardian_id) or supply
  // guardian_name + the optional fields below to create a new one.
  // guardian_relation is always required -- it's the StudentGuardian's
  // relation to THIS student, independent of the guardian's other links.
  @IsOptional()
  @IsString()
  guardian_id?: string | null;

  @ValidateIf((o: CreateAdmissionDto) => !o.guardian_id)
  @IsString()
  guardian_name?: string;

  @IsString()
  guardian_relation!: string;

  @IsOptional()
  @IsString()
  guardian_phone?: string | null;

  @IsOptional()
  @IsString()
  guardian_email?: string | null;

  @IsOptional()
  @IsString()
  guardian_alt_phone?: string | null;

  @IsOptional()
  @IsString()
  guardian_occupation?: string | null;

  @IsOptional()
  @IsString()
  guardian_address?: string | null;

  @IsOptional()
  @IsString()
  guardian_aadhaar_number?: string | null;

  @IsOptional()
  @IsInt()
  guardian_annual_income?: number | null;
}
