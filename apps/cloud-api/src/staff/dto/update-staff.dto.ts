import { IsBoolean, IsOptional, IsString } from "class-validator";

import { CreateStaffDto } from "./create-staff.dto.js";

// Same shape as CreateStaffDto (mirrors Rust's UpdateStaffInput, which
// flattens NewStaffInput plus an id taken from the URL param here), plus a
// couple of edit-only fields that don't make sense at creation time.
export class UpdateStaffDto extends CreateStaffDto {
  // Base64 data-URL, same convention as Branch.signature_url.
  @IsOptional()
  @IsString()
  signature_url?: string | null;

  // At most one principal per branch -- the service clears any other
  // staff's flag in the same branch when this is set true.
  @IsOptional()
  @IsBoolean()
  is_principal?: boolean;
}
