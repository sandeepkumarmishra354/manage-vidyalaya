import { IsIn, IsString } from "class-validator";

import { MASTER_DATA_TYPES } from "../master-data-types.js";

export class CreateMasterDataItemDto {
  @IsIn(MASTER_DATA_TYPES)
  type!: string;

  @IsString()
  name!: string;
}
