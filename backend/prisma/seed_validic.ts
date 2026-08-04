import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const orgId = '6a70dbcbf80c7e63e07eab3e';
const token = 'vx-2154b99c1d76a5cdd14657f240b8903c6de448eb4d474c07381c784439907aa6';

async function main() {
    const patients = await prisma.patient.findMany();
    console.log(`Provisioning real Validic Marketplace tokens for ${patients.length} patients...`);

    for (const p of patients) {
        try {
            const url = `https://api.prod.validic.com/organizations/${orgId}/users?token=${token}`;
            const res = await axios.post(url, { uid: p.id });
            const marketplaceUrl = res.data?.marketplace?.url;
            const validicUserId = res.data?.id;

            if (marketplaceUrl) {
                await prisma.patient.update({
                    where: { id: p.id },
                    data: {
                        validic_user_id: validicUserId,
                        validic_marketplace_url: marketplaceUrl,
                    },
                });
                console.log(`Updated ${p.first_name} ${p.last_name} -> ${marketplaceUrl}`);
            }
        } catch (err: any) {
            console.error(`Error provisioning ${p.first_name}:`, err?.response?.data || err.message);
        }
    }

    console.log('Validic provisioning complete!');
}

main().finally(async () => {
    await prisma.$disconnect();
});
