import { clinicScope } from '../common/tenant';
import {
    Controller, Get, Post, Patch, Param, Body, Query,
    UseGuards, Request, UseInterceptors, UploadedFile, Header, ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { randomUUID as uuidv4 } from 'node:crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LabResultsService } from './lab-results.service';

@UseGuards(JwtAuthGuard)
@Controller('lab-results')
export class LabResultsController {
    constructor(private labResultsService: LabResultsService) { }

    @Get()
    findAll(@Request() req) {
        return this.labResultsService.findAll(clinicScope(req.user));
    }

    @Get('overview')
    @Header('Cache-Control', 'private, no-store')
    overview(@Request() req, @Query('clinic_id') clinicId?: string) {
        if (req.user.role !== 'ADMIN' && !clinicScope(req.user)) {
            throw new ForbiddenException('A clinic account is required.');
        }
        return this.labResultsService.overview(req.user.role === 'ADMIN' ? clinicId || null : clinicScope(req.user));
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        return this.labResultsService.findOne(id, clinicScope(req.user));
    }

    @Post()
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: 25 * 1024 * 1024 },
        fileFilter: (_request, file, callback) => {
            if (!/\.(pdf|png|jpe?g|gif|webp)$/i.test(file.originalname)) return callback(new BadRequestException('Choose a PDF or supported image report.'), false);
            callback(null, true);
        },
    }))
    async create(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: any,
        @Request() req,
    ) {
        const fileUrl = file
            ? `/uploads/lab-results/${uuidv4()}${extname(file.originalname).toLowerCase()}`
            : '';

        return this.labResultsService.create({
            patient_id: body.patient_id,
            test_name: body.test_name,
            result_date: body.result_date,
            status: body.status || 'Available',
            notes: body.notes,
            file_url: fileUrl,
            file_name: file?.originalname,
            file_data: file?.buffer,
            uploaded_by: req.user.id,
            caller_clinic_id: clinicScope(req.user),
        });
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req) {
        return this.labResultsService.updateStatus(id, body.status, clinicScope(req.user));
    }

    @Patch(':id/send')
    sendToClinic(@Param('id') id: string, @Body() body: { clinic_id: string }, @Request() req) {
        return this.labResultsService.sendToClinic(id, body.clinic_id, clinicScope(req.user));
    }

    @Post(':id/access')
    generateAccess(@Param('id') id: string, @Request() req) {
        return this.labResultsService.generateAccess(id, clinicScope(req.user));
    }

    @Post(':id/access/regenerate')
    regenerateAccess(@Param('id') id: string, @Request() req) {
        return this.labResultsService.regenerateAccess(id, clinicScope(req.user));
    }

    @Post(':id/access/send')
    sendAccessToPatient(@Param('id') id: string, @Body() body: { access_code: string }, @Request() req) {
        return this.labResultsService.sendAccessToPatient(id, clinicScope(req.user), body.access_code);
    }
}
