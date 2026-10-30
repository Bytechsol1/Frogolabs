import { NotFoundException } from '@nestjs/common';
import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export function reportFilePath(url: string): string {
  if (
    !/^\/uploads\/lab-results\/[a-zA-Z0-9_-]+\.(pdf|png|jpe?g|gif|webp)$/i.test(
      url,
    )
  )
    throw new NotFoundException('Report file not available.');
  try {
    const root = realpathSync(resolve(process.cwd(), 'uploads', 'lab-results'));
    const file = realpathSync(resolve(process.cwd(), `.${url}`));
    if (!file.startsWith(root + sep)) throw new Error('Invalid report path');
    return file;
  } catch {
    throw new NotFoundException('Report file not available.');
  }
}
