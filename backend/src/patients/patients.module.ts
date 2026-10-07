import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { ValidicModule } from '../validic/validic.module';
import { TerraModule } from '../terra/terra.module';

@Module({
  imports: [ValidicModule, TerraModule],
  providers: [PatientsService],
  controllers: [PatientsController]
})
export class PatientsModule {}
