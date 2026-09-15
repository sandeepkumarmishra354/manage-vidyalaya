import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateRouteDto {
  @IsString()
  branch_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  vehicle_number?: string | null;

  @IsOptional()
  @IsString()
  driver_name?: string | null;

  @IsOptional()
  @IsString()
  driver_phone?: string | null;

  @IsOptional()
  @IsInt()
  capacity?: number | null;
}
