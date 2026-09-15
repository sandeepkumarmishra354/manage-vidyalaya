import { IsString } from "class-validator";

export class UpdateFeeCategoryDto {
  @IsString()
  name!: string;
}
