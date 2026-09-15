import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateBookDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  author?: string | null;

  @IsOptional()
  @IsString()
  isbn?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsInt()
  total_copies!: number;
}
