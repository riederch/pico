import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..', '..');
const rendererOut = join(appRoot, 'dist', 'renderer');
const assetOut = join(appRoot, 'dist', 'assets');

mkdirSync(rendererOut, { recursive: true });
mkdirSync(assetOut, { recursive: true });
for (const file of ['index.html', 'styles.css']) {
  cpSync(join(appRoot, 'src', 'renderer', file), join(rendererOut, file));
}
for (const file of ['status-active.svg', 'status-warning.svg', 'status-blocked.svg']) {
  cpSync(
    join(repoRoot, 'docs', 'design-system', '02_Brand', 'icons', file),
    join(assetOut, file),
  );
}
