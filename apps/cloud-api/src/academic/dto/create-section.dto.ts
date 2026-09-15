import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateSectionDto {
  @IsString()
  class_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  capacity?: number | null;
}
