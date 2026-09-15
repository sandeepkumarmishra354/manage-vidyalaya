import { IsBoolean, IsString } from "class-validator";

export class SetModuleEnabledDto {
  @IsString()
  branch_id!: string;

  @IsString()
  module_key!: string;

  @IsBoolean()
  is_enabled!: boolean;
}
