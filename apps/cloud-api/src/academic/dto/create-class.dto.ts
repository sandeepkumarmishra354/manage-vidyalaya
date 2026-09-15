import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateClassDto {
  @IsString()
  branch_id!: string;

  @IsString()
  academic_session_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}
