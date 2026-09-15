import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateStopDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  sequence?: number;

  @IsOptional()
  @IsString()
  pickup_time?: string | null;
}
