import { IsInt, IsString } from "class-validator";

export class UpdateClassDto {
  @IsString()
  name!: string;

  @IsInt()
  sort_order!: number;
}
