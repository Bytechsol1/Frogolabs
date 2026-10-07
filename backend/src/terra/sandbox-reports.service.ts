import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TerraService } from './terra.service';
import { sandboxAutoReportsEnabled, SANDBOX_REPORT_DELAY_MS } from './sandbox-config';

@Injectable()
export class SandboxReportsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SandboxReportsService.name);
    private timer?: ReturnType<typeof setInterval>;
    private busy = false;

    constructor(private prisma: PrismaService, private terra: TerraService) {}

    onModuleInit() {
        if (!sandboxAutoReportsEnabled()) return;
        this.timer = setInterval(() => void this.runDueJobs(), 10000);
        this.timer.unref();
        void this.runDueJobs();
    }

    onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

    async restorePendingOrders() {
        if (!sandboxAutoReportsEnabled()) return;
        // Previous workers stopped as soon as the report arrived. Resume their
        // remaining sandbox stages without placing another order.
        await this.prisma.sandboxReportJob.updateMany({
            where: { status: 'COMPLETED', order: { environment: 'SANDBOX',
                patient: { is_demo: false, clinic: { is_demo: false } },
                OR: [
                    { terra_order_status: 'order.delivery_fulfilled' },
                    { terra_order_status: 'order.completed', workflow: {
                        history: { none: { status: 'TASSO_INSTRUCTIONS_SENT' } },
                    } },
                ],
            } },
            data: { status: 'WAITING', attempts: 0, next_attempt_at: new Date(), last_error: null },
        });
        const orders = await this.prisma.terraOrder.findMany({
            where: { environment: 'SANDBOX', sandboxReportJob: null,
                terra_order_status: { notIn: ['order.completed', 'order.cancelled', 'order.payment_failed'] },
                patient: { is_demo: false, clinic: { is_demo: false } } },
            select: { id: true, patient_id: true, terra_product_id: true, created_at: true },
        });
        if (!orders.length) return;
        const { tests } = await this.terra.getSandboxConfiguration();
        for (const order of orders) {
            const test = tests.find(t => t.id === order.terra_product_id);
            const due = new Date(order.created_at.getTime() + SANDBOX_REPORT_DELAY_MS);
            await this.prisma.sandboxReportJob.upsert({
                where: { order_id: order.id }, update: {},
                create: {
                    order_id: order.id, patient_id: order.patient_id, variant_id: order.terra_product_id,
                    test_name: test?.name || 'Terra Sandbox Test', country_code: test?.country || '',
                    status: 'WAITING', due_at: due, next_attempt_at: new Date(Math.min(due.getTime(), Date.now() + 30000)),
                },
            });
        }
    }

    async runDueJobs() {
        if (!sandboxAutoReportsEnabled() || this.busy) return;
        this.busy = true;
        try {
            await this.restorePendingOrders();
            const jobs = await this.prisma.sandboxReportJob.findMany({
                where: { status: { notIn: ['COMPLETED', 'FAILED'] }, next_attempt_at: { lte: new Date() } },
                orderBy: { next_attempt_at: 'asc' }, take: 30,
                include: { patient: { select: { clinic_id: true } } },
            });
            for (let offset = 0; offset < jobs.length; offset += 3) {
              await Promise.all(jobs.slice(offset, offset + 3).map(async job => {
                if (!sandboxAutoReportsEnabled()) return;
                // A persisted lease prevents two app instances from claiming the same job.
                // An interrupted worker becomes eligible again after five minutes.
                const lease = await this.prisma.sandboxReportJob.updateMany({
                    where: { id: job.id, status: { notIn: ['COMPLETED', 'FAILED'] }, next_attempt_at: { lte: new Date() } },
                    data: { status: 'RUNNING', next_attempt_at: new Date(Date.now() + 300000), attempts: { increment: 1 } },
                });
                if (lease.count !== 1) return;
                try {
                    let orderId = job.order_id;
                    if (!orderId) {
                        const gb = job.country_code === 'GB';
                        // Sandbox fixtures only: never invent clinical demographics for the patient.
                        const { saved } = await this.terra.createOrder({
                            patient_id: job.patient_id, variant_id: job.variant_id, quantity: 1, collection_type: 'AT_HOME',
                            recipient: { first_name: 'Sandbox', last_name: 'Demo', email: 'sandbox@example.com',
                                phone_number: gb ? '+447911123456' : '+12025550123', date_of_birth: '1990-01-01', gender_at_birth: 'male' },
                            shipping_address: { address_line_1: gb ? '123 Baker Street' : '123 Main Street',
                                city: gb ? 'London' : 'New York', administrative_area: gb ? 'Greater London' : 'NY',
                                postal_code: gb ? 'NW1 6XE' : '10001', country_code: job.country_code },
                        }, job.patient.clinic_id, { referenceId: `frigoflow-sandbox-${job.id}`, testName: job.test_name });
                        orderId = saved.id;
                        await this.prisma.sandboxReportJob.update({ where: { id: job.id }, data: { order_id: orderId } });
                    }
                    const elapsed = Math.max(0, SANDBOX_REPORT_DELAY_MS - (job.due_at.getTime() - Date.now()));
                    const order = await this.terra.advanceSandboxOrder(orderId, job.patient.clinic_id, elapsed);
                    const reportReady = !!order?.lab_result_id && order.results_status === 'results.results_ready';
                    if (reportReady && order.terra_order_status === 'order.completed') {
                        await this.prisma.sandboxReportJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', last_error: null } });
                        this.logger.log(`Sandbox workflow completed for job ${job.id}.`);
                        return;
                    }
                    if (job.due_at.getTime() > Date.now()) {
                        await this.prisma.sandboxReportJob.update({ where: { id: job.id }, data: {
                            status: 'WAITING', next_attempt_at: new Date(Math.min(job.due_at.getTime(), Date.now() + 30000)), attempts: 0, last_error: null,
                        } });
                        return;
                    }
                    if (reportReady && elapsed < SANDBOX_REPORT_DELAY_MS + 30000) {
                        await this.prisma.sandboxReportJob.update({ where: { id: job.id }, data: {
                            status: 'WAITING', next_attempt_at: new Date(job.due_at.getTime() + 30000), attempts: 0, last_error: null,
                        } });
                        return;
                    }
                    throw new Error('Terra report is not ready yet.');
                } catch (error) {
                    const exhausted = job.attempts + 1 >= 10;
                    await this.prisma.sandboxReportJob.update({ where: { id: job.id }, data: {
                        status: exhausted ? 'FAILED' : 'RETRYING',
                        next_attempt_at: new Date(Date.now() + 30000),
                        last_error: exhausted ? 'Terra could not complete this sandbox test. Please retry the job.' : 'Terra is temporarily unavailable. Retrying automatically.',
                    } });
                    this.logger.warn(`Sandbox job ${job.id} ${exhausted ? 'failed' : 'will retry'}: ${error instanceof Error ? error.message : 'upstream failure'}`);
                }
              }));
            }
        } catch (error) {
            this.logger.error('Sandbox report queue could not be processed. It will retry on the next poll.');
        } finally { this.busy = false; }
    }
}
