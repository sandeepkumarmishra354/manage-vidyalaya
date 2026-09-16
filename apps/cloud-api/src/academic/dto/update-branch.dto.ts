import { IsIn, IsOptional, IsString } from "class-validator";

// Deliberately excludes `code`: it feeds the admission-number prefix
// (`confirmAdmission`), so changing it retroactively would be confusing
// for historical admission numbers. This endpoint is identity-only.
export class UpdateBranchDto {
  @IsString()
  name!: string;

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

  @IsOptional()
  @IsString()
  logo_url?: string | null;

  @IsOptional()
  @IsString()
  signature_url?: string | null;

  @IsOptional()
  @IsIn(["classic", "bordered", "tricolor", "emblem", "compact"])
  print_template?: string;

  @IsOptional()
  @IsIn(["white", "yellow", "blue", "pink"])
  print_paper_color?: string;
}
