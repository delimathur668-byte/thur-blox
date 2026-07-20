import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

const copyIfExists = async (source, destination) => {
  const absoluteSource = join(root, source);
  if (!existsSync(absoluteSource)) return false;
  const sourceStats = await stat(absoluteSource);
  await cp(absoluteSource, join(dist, destination || source), {
    recursive: sourceStats.isDirectory(),
    force: true
  });
  return true;
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const requiredFiles = [
  'index.html',
  'app.js',
  'styles.css',
  'manifest.webmanifest',
  'service-worker.js'
];

for (const file of requiredFiles) {
  const copied = await copyIfExists(file);
  if (!copied) throw new Error(`Arquivo obrigatorio ausente no build: ${file}`);
}

for (const directory of ['assets', 'public', 'data', 'src']) {
  await copyIfExists(directory);
}

console.log('Build estatico gerado em dist/');
