// Applies only the additive auth migration; does not reset/seed the database.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { loadEnvFile } = require('node:process');
loadEnvFile(resolve(__dirname, '../.env'));
const prisma = new PrismaClient();

(async () => {
    try {
        const sql = readFileSync(resolve(__dirname, '../prisma/migrations/202609300001_email_verification/migration.sql'), 'utf8');
        const statements = sql.replace(/--[^\n]*/g, '').split(';').map(value => value.trim()).filter(value => value && !/^(BEGIN|COMMIT)$/i.test(value));
        await prisma.$transaction(async tx => {
            // SQL is a fixed repository file, never request input.
            for (const statement of statements) await tx.$executeRawUnsafe(statement);
        });
        console.log('Email verification migration applied. Existing accounts and patient data retained.');
    } catch {
        console.error('Email verification migration failed. Check database connectivity and schema permissions.');
        process.exitCode = 1;
    } finally { await prisma.$disconnect(); }
})();
