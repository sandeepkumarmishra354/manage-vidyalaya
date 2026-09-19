import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // The school's subdomain is deliberately NOT a field here -- trusting a
  // client-supplied value would let anyone claim any tenant. AuthController
  // derives it itself from the request's Origin/Referer header instead (see
  // common/subdomain.ts), which a browser sets from the page's real URL and
  // page JavaScript cannot override.
}
