import { Module } from '@nestjs/common';
import { ValidicService } from './validic.service';
import { ValidicController } from './validic.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ValidicController],
    providers: [ValidicService],
    exports: [ValidicService],
})
export class ValidicModule { }
