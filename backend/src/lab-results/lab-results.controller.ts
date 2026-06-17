import {
    Controller, Get, Post, Patch, Param, Body,
    UseGuards, Request, UseInterceptors, UploadedFile,
    ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LabResultsService } from './lab-results.service';

@UseGuards(JwtAuthGuard)
@Controller('lab-results')
export class LabResultsController {
    constructor(private labResultsService: LabResultsService) { }

    @Get()
    findAll(@Request() req) {
        return this.labResultsService.findAll(req.user.clinic_id);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        return this.labResultsService.findOne(id, req.user.clinic_id);
    }

    @Post()
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: join(process.cwd(), 'uploads', 'lab-results'),
            filename: (_req, file, cb) => {
                cb(null, `${uuidv4()}${extname(file.originalname)}`);
            },
        }),
        limits: { fileSize: 10 * 1024 * 1024 },
    }))
    async create(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: any,
        @Request() req,
    ) {
        const fileUrl = file
            ? `/uploads/lab-results/${file.filename}`
            : '';

        return this.labResultsService.create({
            patient_id: body.patient_id,
            clinic_id: body.clinic_id,
            test_name: body.test_name,
            result_date: body.result_date,
            status: body.status || 'Available',
            notes: body.notes,
            file_url: fileUrl,
            file_name: file?.originalname,
            uploaded_by: req.user.id,
        });
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
        return this.labResultsService.updateStatus(id, body.status);
    }
}
