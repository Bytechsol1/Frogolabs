// Normalize Terra's two country-rejection formats without changing the order.
export function isUnsupportedUsDelivery(body: unknown, country: string | undefined): boolean {
    if (country !== 'US' || !body || typeof body !== 'object') return false;
    const data = body as Record<string, unknown>;
    const fields = Array.isArray(data.invalid_fields) ? data.invalid_fields : [];
    const messages = [data.detail, data.message, data.error, ...fields.map(field => field?.message)];
    return messages.some(message => typeof message === 'string' && (
        /must be one of:\s*GB\s*[.]?$/i.test(message.trim()) ||
        /supported country codes:\s*GB\s*[.]?$/i.test(message.trim())
    ));
}
