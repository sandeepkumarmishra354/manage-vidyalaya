import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AcademicModule } from "./academic/academic.module.js";
import { AppController } from "./app.controller.js";
import { AttendanceModule } from "./attendance/attendance.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuditLogModule } from "./audit-log/audit-log.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ClassSubjectsModule } from "./class-subjects/class-subjects.module.js";
import { CommonModule } from "./common/common.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { DbModule } from "./db/db.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { ExamsModule } from "./exams/exams.module.js";
import { ExpensesModule } from "./expenses/expenses.module.js";
import { FeeCategoriesModule } from "./fee-categories/fee-categories.module.js";
import { FeeDiscountsModule } from "./fee-discounts/fee-discounts.module.js";
import { FeesModule } from "./fees/fees.module.js";
import { HousesModule } from "./houses/houses.module.js";
import { LeaveTypesModule } from "./leave-types/leave-types.module.js";
import { LibraryModule } from "./library/library.module.js";
import { MasterDataModule } from "./master-data/master-data.module.js";
import { ModuleSettingsModule } from "./module-settings/module-settings.module.js";
import { PayrollModule } from "./payroll/payroll.module.js";
import { PromotionModule } from "./promotion/promotion.module.js";
import { QrModule } from "./qr/qr.module.js";
import { RetentionModule } from "./retention/retention.module.js";
import { RolesModule } from "./roles/roles.module.js";
import { SchoolCalendarModule } from "./school-calendar/school-calendar.module.js";
import { StaffModule } from "./staff/staff.module.js";
import { StaffCategoriesModule } from "./staff-categories/staff-categories.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { StudentsModule } from "./students/students.module.js";
import { TimetableModule } from "./timetable/timetable.module.js";
import { TransportModule } from "./transport/transport.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // A generous, always-on baseline against basic scripted abuse/DoS --
    // no real usage pattern in this app (bulk attendance marking,
    // dashboard polling, etc.) comes close to it. Specific sensitive
    // endpoints (login, password reset) layer a much stricter @Throttle
    // on top via their own controllers. THROTTLE_DISABLED exists solely
    // for the E2E suite, which legitimately logs in the same fixed
    // persona emails from one IP far more than any real user would --
    // see apps/e2e/playwright.config.ts.
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.THROTTLE_DISABLED === "1",
    }),
    DbModule,
    CommonModule,
    AuthModule,
    AuditModule,
    UsersModule,
    SchoolCalendarModule,
    AcademicModule,
    StudentsModule,
    AttendanceModule,
    FeesModule,
    FeeCategoriesModule,
    FeeDiscountsModule,
    ExamsModule,
    ClassSubjectsModule,
    HousesModule,
    LibraryModule,
    TransportModule,
    StaffModule,
    StaffCategoriesModule,
    LeaveTypesModule,
    MasterDataModule,
    PayrollModule,
    PromotionModule,
    RolesModule,
    ModuleSettingsModule,
    AuditLogModule,
    DashboardModule,
    RetentionModule,
    StorageModule,
    DocumentsModule,
    ExpensesModule,
    TimetableModule,
    QrModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
