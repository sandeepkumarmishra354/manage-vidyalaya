import { IsObject, IsString } from "class-validator";

export class CreatePromotionBatchDto {
  @IsString()
  branch_id!: string;

  @IsString()
  from_session_id!: string;

  @IsString()
  to_session_id!: string;

  // from_class_id -> to_class_id
  @IsObject()
  class_mapping!: Record<string, string>;
}
