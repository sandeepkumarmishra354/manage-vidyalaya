import { IsInt, IsString } from "class-validator";

export class UpdateFeeStructureDto {
  @IsString()
  name!: string;

  @IsInt()
  amount!: number;

  @IsString()
  frequency!: string;
}
