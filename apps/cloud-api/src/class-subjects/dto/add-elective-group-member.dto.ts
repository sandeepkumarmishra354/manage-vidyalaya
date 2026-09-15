import { IsString } from "class-validator";

export class AddElectiveGroupMemberDto {
  @IsString()
  class_subject_id!: string;
}
