import { IsString } from "class-validator";

export class CreateStaffCategoryDto {
  @IsString()
  name!: string;
}
