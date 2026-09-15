import { IsIn, IsInt, IsString } from "class-validator";

export class AdjustLineItemDto {
  @IsString()
  component_name!: string;

  @IsIn(["earning", "deduction"])
  component_type!: string;

  @IsInt()
  amount!: number;
}
