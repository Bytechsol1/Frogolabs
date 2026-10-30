import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL before running this connection check.');

async function test() {
    console.log('Checking the configured PostgreSQL connection.');
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
        const count = await prisma.patient.count();
        console.log(`\n🎉 BINGO! SUCCESS! Patient Count = ${count}\n`);
    } catch (err: any) {
        console.error('Database connection check failed:', err?.code || 'connection_error');
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

test();
