export const SANDBOX_REPORT_DELAY_MS = 5 * 60 * 1000;

export function sandboxAutoReportsEnabled(): boolean {
    return process.env.TERRA_REQUIRE_LIVE_DATA !== 'true' && terraEnvironment() === 'SANDBOX' && process.env.NODE_ENV !== 'production' && process.env.TERRA_SANDBOX_AUTO_REPORTS === 'true';
}
import { terraEnvironment } from './terra-environment';
