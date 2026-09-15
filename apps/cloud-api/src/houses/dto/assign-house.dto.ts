import { IsString } from "class-validator";

export class AssignHouseDto {
  @IsString()
  student_id!: string;

  @IsString()
  house_id!: string;
}
