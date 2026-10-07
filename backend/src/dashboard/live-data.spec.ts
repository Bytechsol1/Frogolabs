import { displayedTerraEnvironment, displayedWorkflowWhere, displayedResultWhere } from './live-data';

describe('Terra display environment', () => {
    const env = { ...process.env };
    afterEach(() => { process.env = { ...env }; });

    it('shows sandbox progress and explicitly marked sandbox reports when requested', () => {
        process.env.TERRA_ENVIRONMENT = 'sandbox';
        process.env.TERRA_SHOW_SANDBOX_DATA = 'true';
        expect(displayedTerraEnvironment()).toBe('SANDBOX');
        expect(displayedWorkflowWhere().terraOrders).toEqual({ some: { environment: 'SANDBOX' } });
        expect(displayedResultWhere().structured_report).toEqual({ path: ['isSandbox'], equals: true });
    });

    it('never includes sandbox data in production even when the sandbox display flag remains enabled', () => {
        process.env.TERRA_ENVIRONMENT = 'production';
        process.env.TERRA_SHOW_SANDBOX_DATA = 'true';
        expect(displayedTerraEnvironment()).toBe('PRODUCTION');
        expect(displayedResultWhere().structured_report).toEqual({ path: ['isSandbox'], equals: false });
    });
});
