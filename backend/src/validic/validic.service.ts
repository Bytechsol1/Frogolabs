import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ValidicService {
    private readonly logger = new Logger(ValidicService.name);
    private readonly orgId = process.env.VALIDIC_ORG_ID || '6a70dbcbf80c7e63e07eab3e';
    private readonly token = process.env.VALIDIC_API_TOKEN || 'vx-2154b99c1d76a5cdd14657f240b8903c6de448eb4d474c07381c784439907aa6';
    private readonly baseUrl = process.env.VALIDIC_BASE_URL || 'https://api.prod.validic.com';

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Auto-provisions a user in Validic platform using the Frigo Flow Patient ID as uid.
     */
    async provisionUser(patientId: string) {
        try {
            const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
            if (!patient) throw new NotFoundException(`Patient with ID ${patientId} not found`);

            if (patient.validic_user_id && patient.validic_marketplace_url && !patient.validic_marketplace_url.includes('demo_')) {
                return {
                    validic_user_id: patient.validic_user_id,
                    marketplace_url: patient.validic_marketplace_url,
                };
            }

            const url = `${this.baseUrl}/organizations/${this.orgId}/users?token=${this.token}`;
            const response = await axios.post(url, {
                uid: patientId
            });

            const validicUserData = response.data;
            const validicUserId = validicUserData?.id || validicUserData?._id;
            const marketplaceUrl = validicUserData?.marketplace?.url || (validicUserData?.marketplace?.token ? `https://syncmydevice.com?token=${validicUserData.marketplace.token}` : null);

            const updatedPatient = await this.prisma.patient.update({
                where: { id: patientId },
                data: {
                    validic_user_id: validicUserId || `validic_${patientId.slice(0, 8)}`,
                    validic_marketplace_url: marketplaceUrl,
                },
            });

            this.logger.log(`Successfully provisioned Validic user for patient ${patientId}`);
            return {
                validic_user_id: updatedPatient.validic_user_id,
                marketplace_url: updatedPatient.validic_marketplace_url,
            };
        } catch (error) {
            this.logger.error(`Failed to provision Validic user for patient ${patientId}`, error?.response?.data || error.message);
            const fallbackUrl = `https://syncmydevice.com?token=demo_${patientId.slice(0, 8)}`;
            const fallbackUserId = `validic_demo_${patientId.slice(0, 8)}`;

            await this.prisma.patient.update({
                where: { id: patientId },
                data: {
                    validic_user_id: fallbackUserId,
                    validic_marketplace_url: fallbackUrl,
                },
            }).catch(() => { });

            return {
                validic_user_id: fallbackUserId,
                marketplace_url: fallbackUrl,
            };
        }
    }

    /**
     * Gets or provisions the Validic Marketplace URL for device connection portal.
     */
    async getConnectUrl(patientId: string) {
        const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient) throw new NotFoundException('Patient not found');

        if (patient.validic_marketplace_url && !patient.validic_marketplace_url.includes('demo_')) {
            return { marketplace_url: patient.validic_marketplace_url, validic_user_id: patient.validic_user_id };
        }

        return this.provisionUser(patientId);
    }

    /**
     * Saves a health measurement into database.
     */
    async saveMetric(data: {
        patient_id: string;
        metric_type: string;
        value: string;
        numeric_value?: number;
        unit?: string;
        source?: string;
        recorded_at?: Date;
    }) {
        return this.prisma.healthMetric.create({
            data: {
                patient_id: data.patient_id,
                metric_type: data.metric_type,
                value: data.value,
                numeric_value: data.numeric_value ?? null,
                unit: data.unit ?? '',
                source: data.source ?? 'Validic Aggregator',
                recorded_at: data.recorded_at ?? new Date(),
            },
        });
    }

    /**
     * Retrieves health metrics for a patient, grouped by type or sorted by date.
     */
    async getPatientMetrics(patientId: string, metricType?: string) {
        const whereClause: any = { patient_id: patientId };
        if (metricType) whereClause.metric_type = metricType;

        const metrics = await this.prisma.healthMetric.findMany({
            where: whereClause,
            orderBy: { recorded_at: 'desc' },
            take: 100,
        });

        const grouped: Record<string, typeof metrics> = {};
        for (const m of metrics) {
            if (!grouped[m.metric_type]) grouped[m.metric_type] = [];
            grouped[m.metric_type].push(m);
        }

        return {
            total: metrics.length,
            metrics,
            grouped,
        };
    }

    /**
     * Seeds realistic sample vitals for testing dashboard visualizations.
     */
    async seedDemoMetrics(patientId: string) {
        const now = new Date();
        const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

        const sampleData = [
            // Blood Pressure
            { metric_type: 'blood_pressure', value: JSON.stringify({ systolic: 118, diastolic: 78 }), numeric_value: 118, unit: 'mmHg', source: 'Omron Evolv', recorded_at: days(0) },
            { metric_type: 'blood_pressure', value: JSON.stringify({ systolic: 122, diastolic: 80 }), numeric_value: 122, unit: 'mmHg', source: 'Omron Evolv', recorded_at: days(1) },
            { metric_type: 'blood_pressure', value: JSON.stringify({ systolic: 125, diastolic: 82 }), numeric_value: 125, unit: 'mmHg', source: 'Omron Evolv', recorded_at: days(2) },
            { metric_type: 'blood_pressure', value: JSON.stringify({ systolic: 119, diastolic: 79 }), numeric_value: 119, unit: 'mmHg', source: 'Omron Evolv', recorded_at: days(3) },
            
            // Weight
            { metric_type: 'weight', value: '74.5', numeric_value: 74.5, unit: 'kg', source: 'Withings Body+', recorded_at: days(0) },
            { metric_type: 'weight', value: '74.8', numeric_value: 74.8, unit: 'kg', source: 'Withings Body+', recorded_at: days(1) },
            { metric_type: 'weight', value: '75.1', numeric_value: 75.1, unit: 'kg', source: 'Withings Body+', recorded_at: days(3) },

            // Heart Rate
            { metric_type: 'heart_rate', value: '68', numeric_value: 68, unit: 'bpm', source: 'Apple Watch Series 9', recorded_at: days(0) },
            { metric_type: 'heart_rate', value: '72', numeric_value: 72, unit: 'bpm', source: 'Apple Watch Series 9', recorded_at: days(1) },
            { metric_type: 'heart_rate', value: '65', numeric_value: 65, unit: 'bpm', source: 'Apple Watch Series 9', recorded_at: days(2) },

            // Glucose
            { metric_type: 'glucose', value: '98', numeric_value: 98, unit: 'mg/dL', source: 'Dexcom G7', recorded_at: days(0) },
            { metric_type: 'glucose', value: '104', numeric_value: 104, unit: 'mg/dL', source: 'Dexcom G7', recorded_at: days(1) },

            // Steps
            { metric_type: 'steps', value: '8450', numeric_value: 8450, unit: 'steps', source: 'Fitbit Charge 6', recorded_at: days(0) },
            { metric_type: 'steps', value: '10210', numeric_value: 10210, unit: 'steps', source: 'Fitbit Charge 6', recorded_at: days(1) },
            { metric_type: 'steps', value: '7600', numeric_value: 7600, unit: 'steps', source: 'Fitbit Charge 6', recorded_at: days(2) },

            // Sleep
            { metric_type: 'sleep', value: JSON.stringify({ hours: 7.8, quality: 'Good', deep_sleep_hrs: 2.1 }), numeric_value: 7.8, unit: 'hrs', source: 'Oura Ring Gen3', recorded_at: days(0) },
            { metric_type: 'sleep', value: JSON.stringify({ hours: 8.1, quality: 'Optimal', deep_sleep_hrs: 2.4 }), numeric_value: 8.1, unit: 'hrs', source: 'Oura Ring Gen3', recorded_at: days(1) },

            // HRV
            { metric_type: 'hrv', value: '58', numeric_value: 58, unit: 'ms', source: 'Oura Ring Gen3', recorded_at: days(0) },
            { metric_type: 'hrv', value: '62', numeric_value: 62, unit: 'ms', source: 'Oura Ring Gen3', recorded_at: days(1) },

            // SpO2
            { metric_type: 'spo2', value: '98', numeric_value: 98, unit: '%', source: 'Apple Watch Series 9', recorded_at: days(0) },
            { metric_type: 'spo2', value: '99', numeric_value: 99, unit: '%', source: 'Apple Watch Series 9', recorded_at: days(1) },

            // Temperature
            { metric_type: 'temperature', value: '36.6', numeric_value: 36.6, unit: '°C', source: 'Kinsa Smart Thermometer', recorded_at: days(0) },
        ];

        for (const item of sampleData) {
            await this.saveMetric({
                patient_id: patientId,
                ...item,
            });
        }

        return { message: 'Seeded sample vitals successfully', count: sampleData.length };
    }

    /**
     * Processes incoming webhook payloads pushed by Validic.
     */
    async processWebhook(payload: any) {
        this.logger.log(`Received Validic Webhook payload: ${JSON.stringify(payload)}`);
        const dataItems = Array.isArray(payload) ? payload : (payload?.data || [payload]);
        let processedCount = 0;

        for (const item of dataItems) {
            const validicUserId = item.user_id || item.uid;
            if (!validicUserId) continue;

            const patient = await this.prisma.patient.findFirst({
                where: {
                    OR: [
                        { validic_user_id: validicUserId },
                        { id: validicUserId },
                    ]
                }
            });

            if (!patient) {
                this.logger.warn(`Webhook patient match not found for Validic user ${validicUserId}`);
                continue;
            }

            const metricType = item.type || item.category || 'biometrics';
            const value = typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? item.summary ?? '');
            const numericValue = typeof item.value === 'number' ? item.value : (item.systolic || item.steps || item.weight || null);

            await this.saveMetric({
                patient_id: patient.id,
                metric_type: metricType,
                value,
                numeric_value: numericValue,
                unit: item.unit || '',
                source: item.source || 'Validic Direct',
                recorded_at: item.timestamp ? new Date(item.timestamp) : new Date(),
            });

            processedCount++;
        }

        return { status: 'success', processed: processedCount };
    }
}
