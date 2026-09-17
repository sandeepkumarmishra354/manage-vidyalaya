import { IsString } from "class-validator";

export class AttachReceiptDto {
  @IsString()
  storage_key!: string;
}
