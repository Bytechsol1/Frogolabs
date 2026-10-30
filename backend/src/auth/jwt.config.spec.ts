import { randomBytes } from 'node:crypto';
import { readJwtSecret } from './jwt.config';

describe('JWT signing configuration', () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });
  it('fails closed instead of using a shared fallback signing key', () => {
    delete process.env.JWT_SECRET;
    expect(() => readJwtSecret()).toThrow('JWT_SECRET must be configured.');
    process.env.JWT_SECRET = '   ';
    expect(() => readJwtSecret()).toThrow('JWT_SECRET must be configured.');
  });
  it('uses the configured key without changing existing sessions', () => {
    const secret = randomBytes(32).toString('hex');
    process.env.JWT_SECRET = secret;
    expect(readJwtSecret() === secret).toBe(true);
  });
});
