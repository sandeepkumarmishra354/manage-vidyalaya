// Postgres error codes (https://www.postgresql.org/docs/current/errcodes-appendix.html),
// the raw-pg equivalent of Prisma's wrapped PrismaClientKnownRequestError.code.
interface PgErrorLike {
  code?: string;
}

function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === "object" && err !== null && "code" in err;
}

export function isUniqueViolation(err: unknown): boolean {
  return isPgError(err) && err.code === "23505";
}

export function isForeignKeyViolation(err: unknown): boolean {
  return isPgError(err) && err.code === "23503";
}

export function isCheckViolation(err: unknown): boolean {
  return isPgError(err) && err.code === "23514";
}
