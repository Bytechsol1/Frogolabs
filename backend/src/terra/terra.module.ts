import { Module } from '@nestjs/common';
import { TerraController } from './terra.controller';
import { TerraService } from './terra.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SandboxReportsService } from './sandbox-reports.service';
import { WorkflowSyncService } from './workflow-sync.service';

@Module({
    imports: [PrismaModule],
    controllers: [TerraController],
    providers: [TerraService, SandboxReportsService, WorkflowSyncService],
    exports: [TerraService],
})
export class TerraModule { }
