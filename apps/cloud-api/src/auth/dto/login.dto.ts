import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // The school's subdomain, derived client-side from window.location.hostname
  // -- lets the backend resolve the exact tenant instead of scanning every
  // tenant by email alone. Optional so local dev / a tenant with no
  // subdomain assigned yet still logs in via the old fallback path.
  @IsOptional()
  @IsString()
  subdomain?: string;
}
