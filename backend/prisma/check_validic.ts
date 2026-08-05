import { PrismaClient } from '@prisma/client';

async function testPooler(user: string, host: string, port: number) {
    const url = `postgresql://${user}:Bytechsol1122@${host}:${port}/postgres?sslmode=require`;
    const prisma = new PrismaClient({
        datasources: { db: { url } }
    });

    try {
        const count = await prisma.patient.count();
        console.log(`\n🎉====================================================🎉`);
        console.log(`EXACT WORKING SUPABASE POOLER FOUND!`);
        console.log(`URL: ${url}`);
        console.log(`🎉====================================================🎉\n`);
        process.exit(0);
    } catch (err: any) {
        // silent fail
    } finally {
        await prisma.$disconnect();
    }
}

async function main() {
    const users = ['postgres.yhzsnweespehnpfecptc', 'postgres'];
    const regions = [
        'us-west-2',
        'us-east-1',
        'us-east-2',
        'us-west-1',
        'eu-west-1',
        'eu-central-1',
        'eu-west-2',
        'ap-southeast-1',
        'ap-south-1',
        'ca-central-1',
        'sa-east-1'
    ];

    for (const r of regions) {
        const host = `aws-0-${r}.pooler.supabase.com`;
        for (const port of [6543, 5432]) {
            for (const user of users) {
                await testPooler(user, host, port);
            }
        }
    }
    console.log('Done testing regions.');
}

main();
