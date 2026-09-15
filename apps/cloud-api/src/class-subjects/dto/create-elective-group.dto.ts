import { IsString } from "class-validator";

export class CreateElectiveGroupDto {
  @IsString()
  name!: string;
}
