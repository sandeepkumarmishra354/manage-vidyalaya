import { IsInt, Min } from "class-validator";

export class UpdateRetentionPolicyDto {
  @IsInt()
  @Min(1)
  retention_years!: number;
}
