import { IsOptional, IsString } from "class-validator";

export class CreateSubjectDto {
  @IsString()
  branch_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string | null;
}
