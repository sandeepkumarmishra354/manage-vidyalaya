// Must be the first import: src/db/pg-pool.ts reads process.env at module
// load time (not lazily, unlike Prisma's generated client, which bundles
// its own internal dotenv loading -- nothing else in this app explicitly
// loaded .env before now because nothing needed to).
import "dotenv/config";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";

import { AppModule } from "./app.module.js";
import { CaseTransformInterceptor } from "./common/case-transform.interceptor.js";
import { buildCorsOptions } from "./common/cors.js";

async function bootstrap() {
  // Express's default JSON body limit (100kb) is too small for the school
  // details signature upload, which stores an image as a base64 data URI
  // directly on the branch update payload -- disable Nest's auto body
  // parser and re-register it with a larger limit.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: "2mb" }));
  app.use(urlencoded({ extended: true, limit: "2mb" }));
  app.enableCors(buildCorsOptions(process.env.CORS_ALLOWED_ORIGINS));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new CaseTransformInterceptor());
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
