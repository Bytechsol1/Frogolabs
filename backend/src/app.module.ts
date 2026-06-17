import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ClinicsModule } from './clinics/clinics.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LabResultsModule } from './lab-results/lab-results.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    WorkflowsModule,
    ClinicsModule,
    StorageModule,
    NotificationsModule,
    DashboardModule,
    LabResultsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
