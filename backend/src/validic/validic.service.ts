import { Injectable, Logger, NotFoundException, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ValidicService {
    private readonly logger = new Logger(ValidicService.name);
    private readonly orgId = process.env.VALIDIC_ORG_ID;
    private readonly token = process.env.VALIDIC_API_TOKEN;
    private readonly baseUrl = process.env.VALIDIC_BASE_URL || 'https://api.prod.validic.com';

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Auto-provisions a user in Validic platform using the Frigo Flow Patient ID as uid.
     */
    async provisionUser(patientId: string, clinicId: string | null) {
        await this.authorizedPatient(patientId, clinicId);
        if (!this.orgId || !this.token) throw new ServiceUnavailableException('Device integration is not configured.');
        try {
            const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
            if (!patient) throw new NotFoundException(`Patient with ID ${patientId} not found`);

            if (patient.validic_user_id && patient.validic_marketplace_url && !patient.validic_marketplace_url.includes('demo_')) {
                await this.assertUniqueConnection(patient);
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
            if (typeof validicUserId !== 'string' || typeof marketplaceUrl !== 'string' || (validicUserData.uid && validicUserData.uid !== patientId)) throw new ServiceUnavailableException('The provider did not return a verified patient connection.');
            await this.assertUniqueConnection({ id: patientId, validic_user_id: validicUserId, validic_marketplace_url: marketplaceUrl });

            const updatedPatient = await this.prisma.patient.update({
                where: { id: patientId, ...(clinicId ? { clinic_id: clinicId } : {}) },
                data: {
                    validic_user_id: validicUserId,
                    validic_marketplace_url: marketplaceUrl,
                },
            });

            this.logger.log(`Successfully provisioned Validic user for patient ${patientId}`);
            return {
                validic_user_id: updatedPatient.validic_user_id,
                marketplace_url: updatedPatient.validic_marketplace_url,
            };
        } catch (error) {
            this.logger.warn('Device provisioning failed; no shared fallback identity was assigned.');
            throw new ServiceUnavailableException('Unable to connect this patient to the device provider.');
        }
    }

    /**
     * Gets or provisions the Validic Marketplace URL for device connection portal.
     */
    async getConnectUrl(patientId: string, clinicId: string | null) {
        await this.authorizedPatient(patientId, clinicId);
        const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient) throw new NotFoundException('Patient not found');

        if (patient.validic_marketplace_url && !patient.validic_marketplace_url.includes('demo_')) {
            await this.assertUniqueConnection(patient);
            return { marketplace_url: patient.validic_marketplace_url, validic_user_id: patient.validic_user_id };
        }

        return this.provisionUser(patientId, clinicId);
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
    async getPatientMetrics(patientId: string, metricType: string | undefined, clinicId: string | null) {
        await this.authorizedPatient(patientId, clinicId);
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
    async seedDemoMetrics(patientId: string, clinicId: string | null) {
        await this.authorizedPatient(patientId, clinicId);
        if (process.env.NODE_ENV === 'production') throw new BadRequestException('Demo measurements are disabled in production.');
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
    private async authorizedPatient(patientId: string, clinicId: string | null) {
        const patient = await this.prisma.patient.findFirst({ where: { id: patientId, ...(clinicId ? { clinic_id: clinicId } : {}) } });
        if (!patient) throw new NotFoundException('Patient not found');
        return patient;
    }

    private async assertUniqueConnection(patient: { id: string; validic_user_id: string | null; validic_marketplace_url: string | null }) {
        if (!patient.validic_user_id || !patient.validic_marketplace_url) throw new ServiceUnavailableException('This device connection needs a verified patient mapping.');
        let url: URL;
        try { url = new URL(patient.validic_marketplace_url); }
        catch { throw new ServiceUnavailableException('This device connection needs a verified patient mapping.'); }
        if (url.protocol !== 'https:' || url.username || url.password) throw new ServiceUnavailableException('This device connection needs a verified patient mapping.');
        const duplicate = await this.prisma.patient.count({ where: { id: { not: patient.id }, OR: [
            { validic_user_id: patient.validic_user_id }, { validic_marketplace_url: patient.validic_marketplace_url },
        ] } });
        if (duplicate) throw new ServiceUnavailableException('This device connection is shared by multiple patients and needs a verified mapping.');
    }
    async processWebhook(payload: any) {
        const items = Array.isArray(payload) ? payload : (payload?.data || [payload]);
        if (!Array.isArray(items) || items.length > 1000) throw new BadRequestException('Invalid device event batch.');
        const resolved: { item: any; patientId: string }[] = [];
        for (const item of items) {
            const identifier = item?.user_id || item?.uid;
            if (typeof identifier !== 'string') continue;
            const patients = await this.prisma.patient.findMany({ where: { OR: [{ validic_user_id: identifier }, { id: identifier }] }, select: { id: true }, take: 2 });
            if (patients.length !== 1) throw new BadRequestException('Device event has no unambiguous patient mapping.');
            resolved.push({ item, patientId: patients[0].id });
        }
        for (const { item, patientId } of resolved) {
            await this.saveMetric({ patient_id: patientId, metric_type: String(item.type || item.category || 'biometrics'),
                value: typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? item.summary ?? ''),
                numeric_value: typeof item.value === 'number' ? item.value : undefined,
                unit: String(item.unit || ''), source: String(item.source || 'Validic Direct'), recorded_at: item.timestamp ? new Date(item.timestamp) : new Date(),
            });
        }
        return { status: 'success', processed: resolved.length };
    }
}
