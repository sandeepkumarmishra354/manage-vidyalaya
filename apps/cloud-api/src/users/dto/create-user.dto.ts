import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  tenant_id!: string;

  @IsOptional()
  @IsString()
  branch_id?: string | null;

  @IsString()
  full_name!: string;

  @IsString()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
