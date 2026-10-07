import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

// Load before AppModule imports initialize JWT and other environment settings.
// Variables supplied by the host take precedence over the local .env file.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) loadEnvFile(envFile);
