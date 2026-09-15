import { IsBoolean, IsISO8601, IsString } from "class-validator";

export class UpdateAcademicSessionDto {
  @IsString()
  name!: string;

  @IsISO8601()
  start_date!: string;

  @IsISO8601()
  end_date!: string;

  @IsBoolean()
  is_current!: boolean;
}
