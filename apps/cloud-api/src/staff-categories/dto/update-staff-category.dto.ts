import { IsString } from "class-validator";

export class UpdateStaffCategoryDto {
  @IsString()
  name!: string;
}
