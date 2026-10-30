import { Module } from '@nestjs/common';
import { PatientAccessGuard } from './patient-access.guard';
import { PatientAccessController } from './patient-access.controller';
import { LabResultsModule } from '../lab-results/lab-results.module';

@Module({
    imports: [LabResultsModule],
    controllers: [PatientAccessController],
    providers: [PatientAccessGuard],
})
export class PatientAccessModule { }
