import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TerraService } from './terra.service';
import { terraEnvironment } from './terra-environment';

@Injectable()
export class WorkflowSyncService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WorkflowSyncService.name);
    private timer?: ReturnType<typeof setInterval>;
    private busy = false;
    private cursor?: string;
    constructor(private prisma: PrismaService, private terra: TerraService) {}

    onModuleInit() {
        if (!process.env.TERRA_DEV_ID || !process.env.TERRA_API_KEY || process.env.TERRA_WORKFLOW_AUTO_SYNC === 'false') return;
        this.timer = setInterval(() => void this.run(), 30000);
        this.timer.unref();
        void this.run();
    }
    onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

    async run() {
        if (this.busy) return;
        this.busy = true;
        try {
            const orders = await this.prisma.terraOrder.findMany({
                where: { environment: terraEnvironment(), ...(this.cursor ? { id: { gt: this.cursor } } : {}), NOT: {
                    terra_order_status: 'order.completed', results_status: 'results.results_ready',
                    lab_result_id: { not: null }, workflow: { status: 'COMPLETED' },
                    labResult: { structured_report: { path: ['isSandbox'], equals: terraEnvironment() === 'SANDBOX' } },
                } },
                orderBy: { id: 'asc' }, take: 20,
            });
            this.cursor = orders.length === 20 ? orders[orders.length - 1].id : undefined;
            for (const order of orders) {
                try { await this.terra.syncOrder(order.id, null); }
                catch { this.logger.warn('Terra workflow synchronization deferred; retrying on a later pass.'); }
            }
        } catch { this.logger.warn('Workflow synchronization unavailable; retrying on the next interval.'); }
        finally { this.busy = false; }
    }
}
