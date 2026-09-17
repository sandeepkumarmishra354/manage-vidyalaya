import { IsObject, IsString } from "class-validator";

// classMapping reuses the exact { [fromClassId]: toClassId } shape
// PromotionService.suggestClassMapping already produces for student
// promotion -- no separate mapping UI needed.
export class CarryForwardStructuresDto {
  @IsString()
  from_session_id!: string;

  @IsString()
  to_session_id!: string;

  @IsObject()
  class_mapping!: Record<string, string>;
}
