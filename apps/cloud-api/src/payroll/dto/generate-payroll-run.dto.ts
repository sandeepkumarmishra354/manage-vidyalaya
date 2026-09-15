import { IsInt, IsString, Max, Min } from "class-validator";

export class GeneratePayrollRunDto {
  @IsString()
  branch_id!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  period_month!: number;

  @IsInt()
  period_year!: number;
}
