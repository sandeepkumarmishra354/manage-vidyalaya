import { IsString } from "class-validator";

export class ScanStaffAttendanceDto {
  @IsString()
  token!: string;
}
