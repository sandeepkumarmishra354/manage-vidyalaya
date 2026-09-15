import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function transform(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(transform);
  }
  if (value instanceof Date || value === null || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[toSnakeCase(key)] = transform(val);
  }
  return out;
}

// Prisma models and DTOs are camelCase internally, but this API's
// established convention (JWT payload, every request DTO) is snake_case
// JSON. Rather than hand-map every service's response, every response body
// is transformed once here. A key with no uppercase letters -- including
// every field a service already returns pre-mapped -- passes through
// unchanged, so this is safe to layer on top of code that maps by hand.
@Injectable()
export class CaseTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => transform(data)));
  }
}
