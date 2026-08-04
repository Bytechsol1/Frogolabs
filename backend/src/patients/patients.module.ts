import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { ValidicModule } from '../validic/validic.module';

@Module({
  imports: [ValidicModule],
  providers: [PatientsService],
  controllers: [PatientsController]
})
export class PatientsModule {}
