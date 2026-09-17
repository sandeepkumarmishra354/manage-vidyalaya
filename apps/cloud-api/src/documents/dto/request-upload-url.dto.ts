import { IsString } from "class-validator";

export class RequestUploadUrlDto {
  @IsString()
  file_name!: string;

  @IsString()
  content_type!: string;
}
