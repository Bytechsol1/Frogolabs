export function readJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) throw new Error('JWT_SECRET must be configured.');
  return secret;
}
