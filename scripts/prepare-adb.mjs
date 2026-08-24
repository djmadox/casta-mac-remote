import { access, chmod, copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(projectRoot, 'platform-tools', 'adb');
const candidates = [
  process.env.CASTA_ADB_PATH,
  join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
  '/opt/homebrew/bin/adb',
  '/usr/local/bin/adb'
].filter(Boolean);

async function executable(path) {
  try { await access(path, constants.X_OK); return true; }
  catch { return false; }
}

if (await executable(destination)) {
  console.log(`ADB är redan förberedd: ${destination}`);
  process.exit(0);
}

const source = (await Promise.all(candidates.map(async (path) => await executable(path) ? path : null))).find(Boolean);
if (!source) {
  console.error('ADB hittades inte. Installera Android SDK Platform Tools eller ange CASTA_ADB_PATH.');
  process.exit(1);
}

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
await chmod(destination, 0o755);
console.log(`ADB kopierades från ${source}`);
