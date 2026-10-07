export type TerraEnvironment = 'SANDBOX' | 'PRODUCTION';

export function terraEnvironment(): TerraEnvironment {
    const value = (process.env.TERRA_ENVIRONMENT || 'sandbox').toLowerCase();
    if (value === 'production') return 'PRODUCTION';
    if (value === 'sandbox') return 'SANDBOX';
    throw new Error('TERRA_ENVIRONMENT must be sandbox or production.');
}

export function terraBaseUrl(environment: TerraEnvironment = terraEnvironment()): string {
    return environment === 'PRODUCTION' ? 'https://vantage.tryterra.co' : 'https://vantage-sandbox.tryterra.co';
}
