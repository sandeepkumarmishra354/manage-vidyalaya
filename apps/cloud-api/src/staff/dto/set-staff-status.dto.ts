import { IsOptional, IsString } from "class-validator";

export class SetStaffStatusDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  date_of_leaving?: string | null;
}
