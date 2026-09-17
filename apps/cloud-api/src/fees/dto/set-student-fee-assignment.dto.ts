import { IsIn, IsOptional, IsString } from "class-validator";

export class SetStudentFeeAssignmentDto {
  @IsString()
  student_id!: string;

  @IsString()
  fee_structure_id!: string;

  @IsIn(["include", "exclude"])
  mode!: "include" | "exclude";

  @IsOptional()
  @IsString()
  reason?: string | null;
}
