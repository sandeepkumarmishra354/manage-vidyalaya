import { IsString } from "class-validator";

export class IssueBookDto {
  @IsString()
  book_id!: string;

  @IsString()
  student_id!: string;

  @IsString()
  due_date!: string;
}
