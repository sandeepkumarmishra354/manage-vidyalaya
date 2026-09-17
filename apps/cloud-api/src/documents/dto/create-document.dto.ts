import { IsInt, IsString, Min } from "class-validator";

export class CreateDocumentDto {
  @IsString()
  label!: string;

  @IsString()
  storage_key!: string;

  @IsString()
  file_name!: string;

  @IsString()
  mime_type!: string;

  @IsInt()
  @Min(0)
  file_size!: number;
}
