import { IsOptional, IsString } from "class-validator";

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

  @IsString()
  guardian_name!: string;

  @IsString()
  guardian_relation!: string;

  @IsOptional()
  @IsString()
  guardian_phone?: string | null;

  @IsOptional()
  @IsString()
  guardian_email?: string | null;
}
