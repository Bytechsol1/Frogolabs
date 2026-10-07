import { Module } from '@nestjs/common';
import { PatientAccessController } from './patient-access.controller';
import { LabResultsModule } from '../lab-results/lab-results.module';

@Module({
    imports: [LabResultsModule],
    controllers: [PatientAccessController],
})
export class PatientAccessModule { }
