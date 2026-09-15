import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { CaseTransformInterceptor } from "./common/case-transform.interceptor.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new CaseTransformInterceptor());
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
