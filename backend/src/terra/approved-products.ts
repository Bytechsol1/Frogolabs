// Offer only these two products from Terra's actual catalogue.
const APPROVED_TERRA_PRODUCT_IDS = new Set(['10001', '10002']);
const PRODUCT_NAMES = new Map([
    ['essential blood panel', 'Essential Blood Test'], ['essential blood test', 'Essential Blood Test'],
    ['advanced blood panel', 'Advanced Blood Test'], ['advanced blood test', 'Advanced Blood Test'],
]);

export function isApprovedTerraProduct(product: { id?: unknown; name?: unknown }): boolean {
    const name = typeof product?.name === 'string' ? product.name.trim().toLowerCase() : '';
    return APPROVED_TERRA_PRODUCT_IDS.has(String(product.id)) || PRODUCT_NAMES.has(name);
}

export function bloodProductName(product: { id?: unknown; name?: unknown }): string {
    if (String(product.id) === '10001') return 'Essential Blood Test';
    if (String(product.id) === '10002') return 'Advanced Blood Test';
    return PRODUCT_NAMES.get(String(product.name).trim().toLowerCase()) || String(product.name);
}
