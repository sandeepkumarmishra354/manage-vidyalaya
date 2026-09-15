import { IsOptional, IsString } from "class-validator";

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
  email?: string | null;
}
