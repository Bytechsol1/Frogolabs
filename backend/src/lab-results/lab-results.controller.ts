import {
    Controller, Get, Post, Patch, Param, Body, Query,
    UseGuards, Request, UseInterceptors, UploadedFile, Header, ForbiddenException,
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

    @Get('overview')
    @Header('Cache-Control', 'private, no-store')
    overview(@Request() req, @Query('clinic_id') clinicId?: string) {
        if (req.user.role !== 'ADMIN' && !req.user.clinic_id) {
            throw new ForbiddenException('A clinic account is required.');
        }
        return this.labResultsService.overview(req.user.role === 'ADMIN' ? clinicId || null : req.user.clinic_id);
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
        limits: { fileSize: 25 * 1024 * 1024 },
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
            test_name: body.test_name,
            result_date: body.result_date,
            status: body.status || 'Available',
            notes: body.notes,
            file_url: fileUrl,
            file_name: file?.originalname,
            uploaded_by: req.user.id,
            caller_clinic_id: req.user.clinic_id,
        });
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
        return this.labResultsService.updateStatus(id, body.status);
    }

    @Patch(':id/send')
    sendToClinic(@Param('id') id: string, @Body() body: { clinic_id: string }, @Request() req) {
        return this.labResultsService.sendToClinic(id, body.clinic_id, req.user.clinic_id);
    }

    @Post(':id/access')
    generateAccess(@Param('id') id: string, @Request() req) {
        return this.labResultsService.generateAccess(id, req.user.clinic_id);
    }

    @Post(':id/access/regenerate')
    regenerateAccess(@Param('id') id: string, @Request() req) {
        return this.labResultsService.regenerateAccess(id, req.user.clinic_id);
    }

    @Post(':id/access/send')
    sendAccessToPatient(@Param('id') id: string, @Body() body: { access_code: string }, @Request() req) {
        return this.labResultsService.sendAccessToPatient(id, req.user.clinic_id, body.access_code);
    }
}
