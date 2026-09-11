import { AuthGuard } from "@nestjs/passport";

// A `const` alias (not a subclass) so the mixin class's own decorator
// metadata -- including the @Optional() on its AuthModuleOptions
// constructor param -- is used as-is by Nest's DI. Subclassing here
// (`class JwtAuthGuard extends AuthGuard("jwt") {}`) loses that metadata
// because the subclass declares no constructor of its own.
export const JwtAuthGuard = AuthGuard("jwt");
