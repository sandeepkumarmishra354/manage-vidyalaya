import { IsOptional, IsString } from "class-validator";

export class UpdateStudentDto {
  @IsString()
  first_name!: string;

  @IsOptional()
  @IsString()
  last_name?: string | null;

  @IsOptional()
  @IsString()
  roll_number?: string | null;

  @IsOptional()
  @IsString()
  date_of_birth?: string | null;

  @IsOptional()
  @IsString()
  gender?: string | null;

  @IsOptional()
  @IsString()
  blood_group?: string | null;

  @IsOptional()
  @IsString()
  current_class_id?: string | null;

  @IsOptional()
  @IsString()
  current_section_id?: string | null;

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

  @IsOptional()
  @IsString()
  notes?: string | null;

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
}
