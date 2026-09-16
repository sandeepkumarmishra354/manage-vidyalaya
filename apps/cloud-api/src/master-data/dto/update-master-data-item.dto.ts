import { IsString } from "class-validator";

export class UpdateMasterDataItemDto {
  @IsString()
  name!: string;
}
