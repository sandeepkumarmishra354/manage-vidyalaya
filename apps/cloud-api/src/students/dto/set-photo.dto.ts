import { IsString } from "class-validator";

export class SetPhotoDto {
  @IsString()
  storage_key!: string;
}
