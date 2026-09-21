import { IsOptional, IsString } from "class-validator";

export class CreateBranchDto {
  @IsString()
  name!: string;

  // Short, tenant-unique identifier used as the admission-number prefix
  // (see StudentsService.confirmAdmission) -- immutable after creation,
  // same as UpdateBranchDto deliberately excludes it.
  @IsString()
  code!: string;

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
  phone?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;
}
