import { IsOptional, IsString } from "class-validator";

export class UpdateSubjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string | null;
}
