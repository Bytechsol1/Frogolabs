import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTerraOrderInput, TerraService } from './terra.service';
import { requireEmail } from '../common/email-validation';
import { usLabPhoneSchema } from '@frigo-flow/validation';

@Controller('terra')
export class TerraController {
    constructor(private terraService: TerraService) { }

    private clinicScope(user: { role: string; clinic_id: string | null }) {
        if (user.role === 'ADMIN') return null;
        if (user.role !== 'CLINIC_USER' || !user.clinic_id) throw new ForbiddenException('Clinic membership required.');
        return user.clinic_id;
    }

    @UseGuards(JwtAuthGuard)
    @Get('ordering/config')
    orderingConfig() {
        return this.terraService.getOrderingConfiguration();
    }

    @UseGuards(JwtAuthGuard)
    @Get('sandbox/config')
    sandboxConfig() {
        return this.terraService.getSandboxConfiguration();
    }

    @UseGuards(JwtAuthGuard)
    @Post('sandbox/jobs/:id/retry')
    retrySandboxJob(@Param('id') id: string, @Req() req) {
        return this.terraService.retrySandboxJob(id, this.clinicScope(req.user));
    }

    @UseGuards(JwtAuthGuard)
    @Get('test-connection')
    testConnection() {
        return this.terraService.testConnection();
    }

    @UseGuards(JwtAuthGuard)
    @Get('products')
    getProducts() {
        return this.terraService.getProductTypes();
    }

    @UseGuards(JwtAuthGuard)
    @Get('products/:id')
    getProductsByType(@Param('id') id: string) {
        return this.terraService.getProductsByType(id);
    }

    @UseGuards(JwtAuthGuard)
    @Get('products/:id/variants')
    getProductVariants(@Param('id') id: string) {
        return this.terraService.getProductVariants(id);
    }

    // Placing a Terra order is a clinic-workflow action — ADMIN accounts
    // cannot call this even directly, matching the hidden Order Lab Test
    // button on the frontend.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('CLINIC_USER')
    @Post('orders')
    createOrder(@Body() body: CreateTerraOrderInput, @Req() req) {
        body = { ...body, recipient: { ...body?.recipient, email: requireEmail(body?.recipient?.email) } };
        const phone = usLabPhoneSchema.safeParse(body.recipient?.phone_number);
        if (!phone.success) throw new BadRequestException(phone.error.issues[0].message);
        body.recipient.phone_number = phone.data;
        return this.terraService.createOrder(body, this.clinicScope(req.user));
    }

    // Authenticated read of the current, locally-stored Terra order status
    // for a patient. Reflects whatever the webhook handler last wrote to
    // TerraOrder — does not call out to Terra live.
    @UseGuards(JwtAuthGuard)
    @Get('patients/:patientId/orders')
    getOrdersForPatient(@Param('patientId') patientId: string, @Req() req) {
        return this.terraService.getOrdersForPatient(patientId, this.clinicScope(req.user));
    }

    @UseGuards(JwtAuthGuard)
    @Post('orders/:id/sync')
    syncOrder(@Param('id') id: string, @Req() req) {
        return this.terraService.syncOrder(id, this.clinicScope(req.user));
    }

    // Publicly callable by Terra — must NOT be behind JwtAuthGuard.
    // Authenticity is instead verified via Terra's HMAC webhook signature
    // (X-Terra-Signature header) inside TerraService.handleWebhook.
    @Post('webhook')
    handleWebhook(@Req() req: RawBodyRequest<Request>) {
        const signatureHeader = req.headers['x-terra-signature'];
        return this.terraService.handleWebhook(
            Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader,
            req.rawBody,
        );
    }
}
