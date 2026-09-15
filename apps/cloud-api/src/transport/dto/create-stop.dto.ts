import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateStopDto {
  @IsString()
  route_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  sequence?: number;

  @IsOptional()
  @IsString()
  pickup_time?: string | null;
}
