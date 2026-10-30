import { Module } from '@nestjs/common';
import { LabResultFilesController } from './lab-result-files.controller';
import { LabResultsController } from './lab-results.controller';
import { LabResultsService } from './lab-results.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [PrismaModule, MailModule],
    controllers: [LabResultsController, LabResultFilesController],
    providers: [LabResultsService],
    exports: [LabResultsService],
})
export class LabResultsModule { }
