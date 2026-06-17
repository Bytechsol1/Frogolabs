import { Module } from '@nestjs/common';
import { LabResultsController } from './lab-results.controller';
import { LabResultsService } from './lab-results.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [LabResultsController],
    providers: [LabResultsService],
    exports: [LabResultsService],
})
export class LabResultsModule { }
