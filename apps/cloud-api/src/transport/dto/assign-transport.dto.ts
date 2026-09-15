import { IsString } from "class-validator";

export class AssignTransportDto {
  @IsString()
  student_id!: string;

  @IsString()
  route_id!: string;

  @IsString()
  stop_id!: string;
}
