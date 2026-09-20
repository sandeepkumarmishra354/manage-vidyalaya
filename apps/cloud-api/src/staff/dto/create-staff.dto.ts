import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateStaffDto {
  @IsString()
  branch_id!: string;

  // Optional -- the service auto-generates one from the branch code + a
  // running count when left blank, but a school can still supply its own.
  @IsOptional()
  @IsString()
  employee_code?: string;

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
  phone?: string | null;

  @IsOptional()
  @IsString()
  personal_email?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  state?: string | null;

  @IsOptional()
  @IsString()
  pincode?: string | null;

  @IsString()
  designation!: string;

  @IsOptional()
  @IsString()
  category_id?: string | null;

  @IsOptional()
  @IsString()
  department?: string | null;

  @IsString()
  employment_type!: string;

  @IsString()
  date_of_joining!: string;

  @IsOptional()
  @IsString()
  qualification?: string | null;

  @IsOptional()
  @IsString()
  blood_group?: string | null;

  @IsOptional()
  @IsString()
  pan_number?: string | null;

  @IsOptional()
  @IsString()
  aadhaar_number?: string | null;

  @IsOptional()
  @IsString()
  bank_account_number?: string | null;

  @IsOptional()
  @IsString()
  bank_ifsc?: string | null;

  @IsOptional()
  @IsString()
  bank_name?: string | null;

  @IsOptional()
  @IsString()
  pf_number?: string | null;

  @IsOptional()
  @IsString()
  esi_number?: string | null;

  @IsOptional()
  @IsString()
  uan_number?: string | null;

  @IsOptional()
  @IsString()
  emergency_contact_name?: string | null;

  @IsOptional()
  @IsString()
  emergency_contact_phone?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  // DPDP: optional at the DTO level (this class is also extended by
  // UpdateStaffDto for edits, which must not require re-consenting on
  // every save) -- StaffService.createStaff is the only caller that
  // rejects the request when this isn't true. updateStaff never reads it.
  @IsOptional()
  @IsBoolean()
  consent_given?: boolean;
}
