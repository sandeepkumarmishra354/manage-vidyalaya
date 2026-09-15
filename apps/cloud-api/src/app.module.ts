import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AcademicModule } from "./academic/academic.module.js";
import { AppController } from "./app.controller.js";
import { AttendanceModule } from "./attendance/attendance.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ExamsModule } from "./exams/exams.module.js";
import { FeesModule } from "./fees/fees.module.js";
import { HousesModule } from "./houses/houses.module.js";
import { LibraryModule } from "./library/library.module.js";
import { PayrollModule } from "./payroll/payroll.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PromotionModule } from "./promotion/promotion.module.js";
import { StaffModule } from "./staff/staff.module.js";
import { StudentsModule } from "./students/students.module.js";
import { TransportModule } from "./transport/transport.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AuditModule,
    UsersModule,
    AcademicModule,
    StudentsModule,
    AttendanceModule,
    FeesModule,
    ExamsModule,
    HousesModule,
    LibraryModule,
    TransportModule,
    StaffModule,
    PayrollModule,
    PromotionModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
