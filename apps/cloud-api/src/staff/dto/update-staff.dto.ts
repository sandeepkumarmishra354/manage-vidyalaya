import { CreateStaffDto } from "./create-staff.dto.js";

// Same shape as CreateStaffDto (mirrors Rust's UpdateStaffInput, which
// flattens NewStaffInput plus an id taken from the URL param here).
export class UpdateStaffDto extends CreateStaffDto {}
