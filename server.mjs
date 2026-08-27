import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { accessSync, constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  discoverGoogleTVs,
  finishRemotePairing,
  hasRemoteDevice,
  listRemoteDevices,
  remoteMedia,
  sendRemoteCommand,
  sendRemoteText,
  startRemotePairing
} from './remote-service.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const adbCandidates = [
  process.env.CASTA_ADB_PATH,
  process.resourcesPath ? join(process.resourcesPath, 'platform-tools/adb') : null,
  join(homedir(), 'Library/Android/sdk/platform-tools/adb'),
  '/opt/homebrew/bin/adb',
  '/usr/local/bin/adb'
].filter(Boolean);

function findAdb() {
  for (const candidate of adbCandidates) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* try next */ }
  }
  return null;
}

const adb = findAdb();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const keyCodes = { up: 19, down: 20, left: 21, right: 22, select: 23, back: 4, home: 3, power: 177, input: 178, mute: 164, volumeUp: 24, volumeDown: 25, assistant: 231, playPause: 85 };
const appPackages = { youtube: 'com.google.android.youtube.tv', netflix: 'com.netflix.ninja' };
const appNames = {
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'com.spotify.tv.android': 'Spotify',
  'com.netflix.ninja': 'Netflix',
  'com.google.android.youtube.tv': 'YouTube',
  'com.google.android.youtube.tvkids': 'YouTube Kids',
  'com.disney.disneyplus': 'Disney+',
  'com.hbo.hbonow': 'Max',
  'com.google.android.apps.tv.launcherx': 'Google TV'
};
let cachedProfile;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error('För stor förfrågan.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('Ogiltig förfrågan.'); }
}

function validHost(value) {
  return typeof value === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every((part) => Number(part) <= 255);
}
function validPort(value) { return /^\d{2,5}$/.test(String(value)) && Number(value) > 0 && Number(value) < 65536; }
function validDevice(value) { return typeof value === 'string' && /^[a-zA-Z0-9._:-]+$/.test(value); }

async function runAdb(args, timeout = 10000) {
  if (!adb) throw new Error('ADB hittades inte. Installera Android SDK Platform Tools.');
  try {
    const result = await exec(adb, args, { timeout, maxBuffer: 1024 * 1024 });
    return `${result.stdout || ''}${result.stderr || ''}`.trim();
  } catch (error) {
    const detail = `${error.stdout || ''}${error.stderr || ''}`.trim();
    throw new Error(detail || 'ADB-kommandot misslyckades.');
  }
}

async function devices() {
  if (!adb) return [];
  const output = await runAdb(['devices', '-l']);
  return output.split('\n').slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [id, state, ...details] = line.split(/\s+/);
    const model = details.find((part) => part.startsWith('model:'))?.slice(6).replaceAll('_', ' ') || 'Google TV';
    return { id: `adb:${id}`, adbTarget: id, mode: 'advanced', state, name: model, connected: state === 'device' };
  }).filter((device) => !device.adbTarget.startsWith('*'));
}

async function userProfile() {
  if (cachedProfile) return cachedProfile;
  const username = userInfo().username;
  let name = username;
  try {
    const result = await exec('/usr/bin/id', ['-F'], { timeout: 2000 });
    if (result.stdout.trim()) name = result.stdout.trim();
  } catch { /* Unix-användarnamnet är en säker reserv. */ }
  cachedProfile = { name: name.slice(0, 80), username };
  return cachedProfile;
}

function parseMdns(output) {
  const entries = [];
  for (const line of output.split('\n')) {
    const match = line.match(/([^\s]+)\s+(_adb-tls-(?:pairing|connect)\._tcp\.?)\s+((?:\d{1,3}\.){3}\d{1,3}):(\d+)/);
    if (match) entries.push({ service: match[2].includes('pairing') ? 'pairing' : 'connect', name: match[1], host: match[3], port: Number(match[4]) });
  }
  return entries;
}

function parseMediaSession(output) {
  const sessionLines = output.slice(output.indexOf('Sessions Stack')).split('\n');
  const blocks = [];
  let current = null;
  for (let index = 0; index < sessionLines.length; index += 1) {
    const line = sessionLines[index];
    if (/^    \S.*\(userId=\d+\)$/.test(line) && /^      ownerPid=/.test(sessionLines[index + 1] || '')) {
      if (current) blocks.push(current.join('\n'));
      current = [line];
    } else if (current) current.push(line);
  }
  if (current) blocks.push(current.join('\n'));

  const sessions = blocks.map((block) => {
    const packageName = block.match(/^      package=(.+)$/m)?.[1]?.trim();
    const stateMatch = block.match(/state=PlaybackState \{state=([A-Z_]+)\(/);
    const description = block.match(/^      metadata:.*description=(.+)$/m)?.[1]?.trim();
    const parts = description && description !== 'null' ? description.split(', ').map((part) => part.trim()).filter(Boolean) : [];
    const app = appNames[packageName] || packageName?.split('.').filter(Boolean).at(-1) || 'Media';
    const genericTitle = parts[0] && !/^null$/i.test(parts[0]) ? parts[0] : '';
    const title = genericTitle && genericTitle.toLowerCase().replaceAll(' ', '') !== app.toLowerCase().replaceAll(' ', '') ? genericTitle : app;
    const subtitleParts = parts.slice(1).filter((part) => !/^null$/i.test(part));
    return {
      packageName,
      app,
      title,
      subtitle: subtitleParts.join(' · '),
      state: stateMatch?.[1]?.toLowerCase() || 'stopped',
      active: /^      active=true$/m.test(block),
      hasMetadata: Boolean(description && description !== 'null')
    };
  }).filter((session) => session.packageName);

  return sessions.find((session) => session.active && session.state === 'playing')
    || sessions.find((session) => session.active)
    || sessions.find((session) => ['playing', 'paused'].includes(session.state) && session.hasMetadata)
    || null;
}

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/status') {
    try {
      const [remoteDevices, advancedDevices, profile] = await Promise.all([listRemoteDevices(), devices(), userProfile()]);
      return json(res, 200, { adbAvailable: Boolean(adb), devices: [...remoteDevices, ...advancedDevices], profile });
    }
    catch (error) { return json(res, 503, { adbAvailable: Boolean(adb), devices: [], error: error.message }); }
  }
  if (req.method === 'GET' && pathname === '/api/discover') {
    try { return json(res, 200, { devices: await discoverGoogleTVs() }); }
    catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (req.method === 'GET' && pathname === '/api/advanced/discover') {
    try { return json(res, 200, { services: parseMdns(await runAdb(['mdns', 'services'])) }); }
    catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (req.method === 'GET' && pathname === '/api/media') {
    try {
      const device = new URL(req.url, 'http://localhost').searchParams.get('device');
      if (hasRemoteDevice(device)) return json(res, 200, { media: remoteMedia(device) });
      const adbTarget = typeof device === 'string' && device.startsWith('adb:') ? device.slice(4) : '';
      if (!validDevice(adbTarget)) throw new Error('Ingen giltig enhet är vald.');
      const output = await runAdb(['-s', adbTarget, 'shell', 'dumpsys', 'media_session']);
      return json(res, 200, { media: parseMediaSession(output) });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/remote/pair/start') {
    try {
      const data = await bodyJson(req);
      return json(res, 200, await startRemotePairing(data.host, data.name));
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/remote/pair/finish') {
    try {
      const data = await bodyJson(req);
      return json(res, 200, { ok: true, device: await finishRemotePairing(data.host, data.code) });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/advanced/pair') {
    try {
      const data = await bodyJson(req);
      if (!validHost(data.host) || !validPort(data.port) || !/^\d{6}$/.test(String(data.code))) throw new Error('Kontrollera IP-adress, parningsport och sexsiffrig kod.');
      const output = await runAdb(['pair', `${data.host}:${data.port}`, String(data.code)], 20000);
      if (!/success|already paired/i.test(output)) throw new Error(output || 'Parningen misslyckades.');
      await new Promise((resolve) => setTimeout(resolve, 900));
      const services = parseMdns(await runAdb(['mdns', 'services']));
      const connectService = services.find((service) => service.service === 'connect' && service.host === data.host);
      const connected = (await devices()).find((device) => device.connected && (!connectService || device.adbTarget.startsWith(connectService.name)));
      return json(res, 200, { ok: true, message: output, device: connected || null, connectService: connectService || null });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/advanced/connect') {
    try {
      const data = await bodyJson(req);
      if (!validHost(data.host) || !validPort(data.port)) throw new Error('Kontrollera IP-adress och anslutningsport.');
      const id = `${data.host}:${data.port}`;
      const output = await runAdb(['connect', id], 15000);
      if (!/connected to|already connected/i.test(output)) throw new Error(output || 'Anslutningen misslyckades.');
      const found = (await devices()).find((device) => device.adbTarget === id && device.connected);
      if (!found) throw new Error('TV:n svarade men blev inte tillgänglig. Försök igen.');
      return json(res, 200, { ok: true, device: found });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/command') {
    try {
      const data = await bodyJson(req);
      if (hasRemoteDevice(data.device)) sendRemoteCommand(data.device, data.command);
      else {
        const adbTarget = typeof data.device === 'string' && data.device.startsWith('adb:') ? data.device.slice(4) : '';
        if (!validDevice(adbTarget)) throw new Error('Ingen giltig enhet är vald.');
        if (keyCodes[data.command]) await runAdb(['-s', adbTarget, 'shell', 'input', 'keyevent', String(keyCodes[data.command])]);
        else if (appPackages[data.command]) await runAdb(['-s', adbTarget, 'shell', 'monkey', '-p', appPackages[data.command], '-c', 'android.intent.category.LAUNCHER', '1']);
        else throw new Error('Okänt fjärrkommando.');
      }
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && pathname === '/api/text') {
    try {
      const data = await bodyJson(req);
      if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 200) throw new Error('Texten måste vara 1–200 tecken.');
      if (hasRemoteDevice(data.device)) sendRemoteText(data.device, data.text);
      else {
        const adbTarget = typeof data.device === 'string' && data.device.startsWith('adb:') ? data.device.slice(4) : '';
        if (!validDevice(adbTarget)) throw new Error('Ingen giltig enhet är vald.');
        const safeText = data.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 .,_-]/g, '').replaceAll(' ', '%s');
        if (!safeText) throw new Error('Texten innehåller inga tecken som kan skickas.');
        await runAdb(['-s', adbTarget, 'shell', 'input', 'text', safeText]);
      }
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  return json(res, 404, { error: 'API-anropet finns inte.' });
}

async function serveFile(req, res, pathname) {
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root) || extname(safePath) === '.mjs' || safePath === 'package.json') return json(res, 404, { error: 'Filen finns inte.' });
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error();
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream', 'content-length': data.length });
    res.end(data);
  } catch { json(res, 404, { error: 'Filen finns inte.' }); }
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url.pathname);
    else await serveFile(req, res, url.pathname);
  } catch (error) { json(res, 500, { error: error.message || 'Internt fel.' }); }
});

export function startServer(listenPort = port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      console.log(`Casta körs på http://127.0.0.1:${address.port}`);
      console.log(adb ? `ADB: ${adb}` : 'ADB hittades inte');
      resolve(server);
    });
  });
}

const launchedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (launchedDirectly) startServer();
