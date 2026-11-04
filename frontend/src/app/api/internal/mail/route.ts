import { createSmtpDeliveryHandler } from '@/lib/server/smtp-delivery';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const POST = createSmtpDeliveryHandler();
