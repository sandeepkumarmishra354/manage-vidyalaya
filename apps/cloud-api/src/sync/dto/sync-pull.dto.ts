import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class SyncPullQueryDto {
  @IsString()
  tenant_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  since_server_seq!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
