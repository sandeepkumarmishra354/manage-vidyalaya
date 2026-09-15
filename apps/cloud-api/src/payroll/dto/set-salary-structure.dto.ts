import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class SalaryComponentDto {
  @IsString()
  component_name!: string;

  @IsIn(["earning", "deduction"])
  component_type!: string;

  @IsIn(["fixed", "percent_of_basic"])
  calculation_type!: string;

  @IsOptional()
  @IsInt()
  amount?: number | null;

  @IsOptional()
  @IsNumber()
  percent?: number | null;
}

export class SetSalaryStructureDto {
  @IsString()
  staff_id!: string;

  @IsString()
  branch_id!: string;

  @IsString()
  effective_from!: string;

  @IsInt()
  basic_amount!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  components!: SalaryComponentDto[];
}
