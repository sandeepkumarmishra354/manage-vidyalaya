import { IsOptional, IsString } from "class-validator";

export class SetClassTeacherDto {
  @IsOptional()
  @IsString()
  staff_id?: string | null;
}
