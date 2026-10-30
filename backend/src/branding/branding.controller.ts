import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Put,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { TenantUser } from '../common/tenant';
import { BrandingService, publicBranding } from './branding.service';

@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get('public/:id')
  @Header('Cache-Control', 'no-store')
  async publicClinic(@Param('id') id: string) {
    return publicBranding(await this.branding.publicClinic(id));
  }

  @Get('public/:id/logo')
  async logo(@Param('id') id: string, @Res() response: Response) {
    const logo = await this.branding.logo(id);
    response.setHeader('Content-Type', logo.mime);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    response.setHeader('Cache-Control', 'no-store');
    response.send(logo.body);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  get(@Param('id') id: string, @Req() request: { user: TenantUser }) {
    return this.branding.get(id, request.user);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  save(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user: TenantUser },
  ) {
    return this.branding.save(id, body, request.user);
  }

  @Post(':id/logo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    }),
  )
  upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: { user: TenantUser },
  ) {
    return this.branding.upload(id, file, request.user);
  }

  @Delete(':id/logo')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() request: { user: TenantUser }) {
    return this.branding.remove(id, request.user);
  }
}
