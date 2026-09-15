import { IsBoolean } from "class-validator";

export class SetUserActiveDto {
  @IsBoolean()
  is_active!: boolean;
}
