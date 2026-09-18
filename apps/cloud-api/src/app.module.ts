import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

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
import { LibraryModule } from "./library/library.module.js";
import { MasterDataModule } from "./master-data/master-data.module.js";
import { ModuleSettingsModule } from "./module-settings/module-settings.module.js";
import { PayrollModule } from "./payroll/payroll.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PromotionModule } from "./promotion/promotion.module.js";
import { QrModule } from "./qr/qr.module.js";
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
    PrismaModule,
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
    MasterDataModule,
    PayrollModule,
    PromotionModule,
    RolesModule,
    ModuleSettingsModule,
    AuditLogModule,
    DashboardModule,
    StorageModule,
    DocumentsModule,
    ExpensesModule,
    TimetableModule,
    QrModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
