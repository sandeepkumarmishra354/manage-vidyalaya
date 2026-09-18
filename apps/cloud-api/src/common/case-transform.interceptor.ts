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

// Request/response DTOs and a handful of hand-built response objects (e.g.
// the JWT payload) are camelCase internally, but this API's established
// convention (JWT payload, every request DTO) is snake_case JSON. Rather
// than hand-map every service's response, every response body is
// transformed once here. A key with no uppercase letters -- including
// every column DbService already returns snake_case from Postgres --
// passes through unchanged, so this is safe to layer on top of code that
// already returns pre-mapped rows.
@Injectable()
export class CaseTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => transform(data)));
  }
}
