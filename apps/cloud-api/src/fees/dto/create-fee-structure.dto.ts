import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateFeeStructureDto {
  @IsString()
  branch_id!: string;

  // Null means "session-independent" -- applies until explicitly changed,
  // with no need to recreate it every session (e.g. a flat library fee).
  // A class-scoped structure always needs a session (enforced in the
  // service), since a Class row only exists within one session.
  @IsOptional()
  @IsString()
  academic_session_id?: string | null;

  @IsOptional()
  @IsString()
  class_id?: string | null;

  @IsString()
  name!: string;

  @IsInt()
  amount!: number;

  @IsString()
  frequency!: string;

  // Validated against the tenant's FeeCategory list in FeesService, not a
  // static enum -- fee categories are tenant-extensible.
  @IsOptional()
  @IsString()
  fee_type?: string;
}
