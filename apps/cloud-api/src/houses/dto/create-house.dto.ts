import { IsOptional, IsString } from "class-validator";

export class CreateHouseDto {
  @IsString()
  branch_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string | null;
}
