import { IsString } from "class-validator";

export class CreateFeeCategoryDto {
  @IsString()
  name!: string;
}
