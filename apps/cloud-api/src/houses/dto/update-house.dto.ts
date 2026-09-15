import { IsOptional, IsString } from "class-validator";

export class UpdateHouseDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string | null;
}
