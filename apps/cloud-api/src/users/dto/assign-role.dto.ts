import { IsString } from "class-validator";

export class AssignRoleDto {
  @IsString()
  role_id!: string;
}
