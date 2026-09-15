import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateStaffLoginDto {
  @IsString()
  staff_id!: string;

  @IsString()
  email!: string;

  @IsString()
  full_name!: string;

  @IsString()
  @MinLength(8)
  initial_password!: string;

  @IsOptional()
  @IsString()
  branch_id?: string | null;
}
