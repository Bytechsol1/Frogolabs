import { PrismaClient } from '@prisma/client';

const url = 'postgresql://postgres.yhzsnweespehnpfecptc:Bytechsol1122@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require';

async function test() {
    console.log('Testing Exact Supabase Pooler URL:', url);
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
        const count = await prisma.patient.count();
        console.log(`\n🎉 BINGO! SUCCESS! Patient Count = ${count}\n`);
    } catch (err: any) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

test();
