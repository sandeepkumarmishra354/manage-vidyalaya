import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateSectionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  capacity?: number | null;
}
