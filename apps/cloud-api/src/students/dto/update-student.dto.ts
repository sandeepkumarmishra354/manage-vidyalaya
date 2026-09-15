import { IsOptional, IsString } from "class-validator";

export class UpdateStudentDto {
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
}
