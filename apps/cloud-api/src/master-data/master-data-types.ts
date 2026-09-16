import type { PermissionKey } from "../common/permission-catalog.js";

// The generic MasterDataItem table serves every tenant-customizable lookup
// list that has no dedicated table of its own (Staff Category and Fee
// Category already have one each, so they aren't included here -- see
// master-data-page.tsx on the frontend for how all of them appear together
// in the same admin screen anyway).
export const MASTER_DATA_TYPES = [
  "gender",
  "blood_group",
  "religion",
  "nationality",
  "mother_tongue",
  "student_category",
  "guardian_relation",
] as const;

export type MasterDataType = (typeof MASTER_DATA_TYPES)[number];

export function isMasterDataType(type: string): type is MasterDataType {
  return (MASTER_DATA_TYPES as readonly string[]).includes(type);
}

// Each type is independently permission-gated so a super admin can grant
// exactly the lookup lists a role should manage, not one all-or-nothing
// switch.
export const MANAGE_PERMISSION_BY_TYPE: Record<MasterDataType, PermissionKey> = {
  gender: "master_data.manage_gender",
  blood_group: "master_data.manage_blood_group",
  religion: "master_data.manage_religion",
  nationality: "master_data.manage_nationality",
  mother_tongue: "master_data.manage_mother_tongue",
  student_category: "master_data.manage_student_category",
  guardian_relation: "master_data.manage_guardian_relation",
};
