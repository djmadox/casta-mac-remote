import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createAndroidRemote, RemoteKeyCode } from '@kud/androidtv-remote';

const keyCodes = {
  up: RemoteKeyCode.KEYCODE_DPAD_UP,
  down: RemoteKeyCode.KEYCODE_DPAD_DOWN,
  left: RemoteKeyCode.KEYCODE_DPAD_LEFT,
  right: RemoteKeyCode.KEYCODE_DPAD_RIGHT,
  select: RemoteKeyCode.KEYCODE_DPAD_CENTER,
  back: RemoteKeyCode.KEYCODE_BACK,
  home: RemoteKeyCode.KEYCODE_HOME,
  power: RemoteKeyCode.KEYCODE_POWER,
  input: RemoteKeyCode.KEYCODE_TV_INPUT,
  mute: RemoteKeyCode.KEYCODE_VOLUME_MUTE,
  volumeUp: RemoteKeyCode.KEYCODE_VOLUME_UP,
  volumeDown: RemoteKeyCode.KEYCODE_VOLUME_DOWN,
  assistant: RemoteKeyCode.KEYCODE_ASSIST,
  playPause: RemoteKeyCode.KEYCODE_MEDIA_PLAY_PAUSE
};

const appPackages = {
  youtube: 'com.google.android.youtube.tv',
  netflix: 'com.netflix.ninja'
};

const appNames = {
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'com.spotify.tv.android': 'Spotify',
  'com.netflix.ninja': 'Netflix',
  'com.google.android.youtube.tv': 'YouTube',
  'com.google.android.youtube.tvkids': 'YouTube Kids',
  'com.disney.disneyplus': 'Disney+',
  'com.wbd.stream': 'Max',
  'com.hbo.hbonow': 'Max',
  'com.apple.atve.androidtv.appletv': 'Apple TV',
  'com.google.android.apps.tv.launcherx': 'Google TV'
};

let dataDirectory = process.env.CASTA_DATA_DIR || join(homedir(), '.config', 'casta');
let credentials = {
  protect: (value) => `plain:${Buffer.from(value, 'utf8').toString('base64')}`,
  unprotect: (value) => Buffer.from(value.replace(/^plain:/, ''), 'base64').toString('utf8')
};
const sessions = new Map();
const pendingPairs = new Map();
let sessionsLoaded = false;

export function configureRemoteRuntime(options = {}) {
  if (options.dataDirectory) dataDirectory = options.dataDirectory;
  if (options.protect && options.unprotect) credentials = { protect: options.protect, unprotect: options.unprotect };
}

function validHost(host) {
  return typeof host === 'string' && (
    (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && host.split('.').every((part) => Number(part) <= 255))
    || /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.local\.?$/.test(host)
  );
}

function storePath() { return join(dataDirectory, 'devices.json'); }

async function readStore() {
  try {
    const stored = JSON.parse(await readFile(storePath(), 'utf8'));
    const devices = [];
    for (const item of stored.devices || []) {
      if (!validHost(item.host) || typeof item.credentials !== 'string') continue;
      try {
        const cert = JSON.parse(credentials.unprotect(item.credentials));
        if (typeof cert.key === 'string' && typeof cert.cert === 'string') {
          devices.push({ host: item.host, port: Number(item.port) || 6466, name: String(item.name || 'Google TV').slice(0, 100), cert });
        }
      } catch { /* Credentials tied to another keychain cannot be used. */ }
    }
    return devices;
  } catch { return []; }
}

async function saveRecord(record) {
  const devices = (await readStore()).filter((device) => device.host !== record.host);
  devices.push(record);
  const stored = {
    version: 1,
    devices: devices.map((device) => ({
      host: device.host,
      port: device.port || 6466,
      name: device.name,
      credentials: credentials.protect(JSON.stringify(device.cert))
    }))
  };
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${storePath()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, storePath());
  await chmod(storePath(), 0o600);
}

function publicDevice(record, session = sessions.get(record.host)) {
  return {
    id: `remote:${record.host}`,
    host: record.host,
    name: record.name || 'Google TV',
    mode: 'standard',
    state: session?.ready ? 'connected' : session?.connecting ? 'connecting' : 'offline',
    connected: Boolean(session?.ready),
    powered: session?.powered ?? null,
    volume: session?.volume ?? null,
    currentApp: session?.currentApp ?? null
  };
}

function scheduleReconnect(record, session) {
  if (session.stopped || session.reconnectTimer || session.unpaired) return;
  const delay = Math.min(30_000, 2_000 * (session.attempts + 1));
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    connectRecord(record).catch(() => {});
  }, delay);
}

function markDisconnected(record, session, remote, error) {
  if (session.remote !== remote) return;
  session.ready = false;
  session.connecting = false;
  session.error = error.message;
  session.remote = null;
  session.attempts += 1;
  try { remote.stop(); } catch { /* already closed */ }
  scheduleReconnect(record, session);
}

function attachRemote(record, session, remote) {
  remote.on('ready', () => {
    session.ready = true;
    session.connecting = false;
    session.attempts = 0;
    session.error = null;
  });
  remote.on('powered', (powered) => { session.powered = powered; });
  remote.on('volume', (volume) => { session.volume = volume; });
  remote.on('current_app', (currentApp) => { session.currentApp = currentApp; });
  remote.on('unpaired', () => {
    session.unpaired = true;
    markDisconnected(record, session, remote, new Error('TV:n avvisade den sparade parkopplingen.'));
  });
  remote.on('error', (error) => markDisconnected(record, session, remote, error));
}

async function connectRecord(record, waitForReady = false) {
  let session = sessions.get(record.host);
  if (!session) {
    session = { ready: false, connecting: false, attempts: 0, stopped: false, unpaired: false, currentApp: null, powered: null, volume: null, error: null, remote: null, reconnectTimer: null };
    sessions.set(record.host, session);
  }
  if (!session.ready && !session.connecting) {
    session.stopped = false;
    session.connecting = true;
    const remote = createAndroidRemote(record.host, {
      cert: record.cert,
      pairing_port: 6467,
      remote_port: record.port || 6466,
      service_name: 'Casta',
      manufacturer: 'Apple',
      model: 'Mac'
    });
    session.remote = remote;
    attachRemote(record, session, remote);
    remote.start().then((started) => {
      if (!started) markDisconnected(record, session, remote, new Error('TV:n svarade inte på fjärranslutningen.'));
    }).catch((error) => markDisconnected(record, session, remote, error));
  }
  if (!waitForReady || session.ready) return session;
  const startedAt = Date.now();
  while (!session.ready && session.connecting && Date.now() - startedAt < 10_000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!session.ready) throw new Error(session.error || 'Det gick inte att ansluta till TV:n.');
  return session;
}

export async function listRemoteDevices() {
  const records = await readStore();
  if (!sessionsLoaded) {
    sessionsLoaded = true;
    for (const record of records) connectRecord(record).catch(() => {});
  }
  return records.map((record) => publicDevice(record));
}

function browseServices(timeout = 3500) {
  return new Promise((resolve) => {
    const names = new Set();
    const browser = spawn('/usr/bin/dns-sd', ['-B', '_androidtvremote2._tcp', 'local.']);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { browser.kill(); } catch { /* already closed */ }
      resolve([...names]);
    };
    browser.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        const match = line.match(/\sAdd\s+\d+\s+\d+\s+\S+\s+_androidtvremote2\._tcp\.\s+(.+)$/);
        if (match) names.add(match[1].trim());
      }
    });
    browser.on('error', finish);
    browser.on('exit', finish);
    setTimeout(finish, timeout);
  });
}

function resolveService(name, timeout = 2500) {
  return new Promise((resolve) => {
    const resolver = spawn('/usr/bin/dns-sd', ['-L', name, '_androidtvremote2._tcp', 'local.']);
    let output = '';
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      try { resolver.kill(); } catch { /* already closed */ }
      resolve(value);
    };
    resolver.stdout.on('data', (data) => {
      output += data.toString();
      const match = output.match(/can be reached at ([^:]+):(\d+)/);
      if (match) finish({ hostname: match[1].replace(/\.$/, ''), port: Number(match[2]) });
    });
    resolver.on('error', () => finish(null));
    setTimeout(() => finish(null), timeout);
  });
}

export async function discoverGoogleTVs() {
  const names = await browseServices();
  const devices = await Promise.all(names.map(async (name) => {
    const service = await resolveService(name);
    if (!service) return null;
    try {
      const address = await lookup(service.hostname, { family: 4 });
      return { name, host: address.address, hostname: service.hostname, port: service.port || 6466 };
    } catch { return null; }
  }));
  return devices.filter(Boolean);
}

export async function startRemotePairing(host, name) {
  if (!validHost(host)) throw new Error('Kontrollera TV:ns IP-adress.');
  pendingPairs.get(host)?.remote.stop();
  const remote = createAndroidRemote(host, { pairing_port: 6467, remote_port: 6466, service_name: 'Casta', manufacturer: 'Apple', model: 'Mac' });
  let resolveSecret;
  let rejectSecret;
  let resolveReady;
  let rejectReady;
  const secretPromise = new Promise((resolve, reject) => { resolveSecret = resolve; rejectSecret = reject; });
  const readyPromise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  readyPromise.catch(() => {});
  const pending = { host, name: String(name || 'Google TV').slice(0, 100), remote, readyPromise, createdAt: Date.now() };
  pendingPairs.set(host, pending);
  remote.once('secret', resolveSecret);
  remote.once('ready', resolveReady);
  remote.once('unpaired', () => rejectReady(new Error('Koden godkändes inte av TV:n.')));
  remote.on('error', (error) => { rejectSecret(error); rejectReady(error); });
  remote.start().then((started) => {
    if (!started) throw new Error('TV:n svarade inte. Kontrollera att den är på och ansluten till samma Wi‑Fi.');
  }).catch((error) => { rejectSecret(error); rejectReady(error); });
  try {
    await Promise.race([
      secretPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TV:n visade ingen kod. Kontrollera nätverket och försök igen.')), 12_000))
    ]);
    return { ok: true, host };
  } catch (error) {
    remote.stop();
    pendingPairs.delete(host);
    throw error;
  }
}

export async function finishRemotePairing(host, code) {
  if (!validHost(host) || typeof code !== 'string' || !/^[a-zA-Z0-9]{6}$/.test(code.trim())) {
    throw new Error('Ange den sex tecken långa koden som visas på TV:n.');
  }
  const pending = pendingPairs.get(host);
  if (!pending || Date.now() - pending.createdAt > 120_000) throw new Error('Parkopplingen har gått ut. Börja om och be TV:n visa en ny kod.');
  if (!pending.remote.sendCode(code.trim().toUpperCase())) throw new Error('Koden kunde inte skickas. Kontrollera den och försök igen.');
  try {
    await Promise.race([
      pending.readyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TV:n godkände inte koden i tid.')), 15_000))
    ]);
    const record = { host, port: 6466, name: pending.name, cert: pending.remote.getCertificate() };
    pending.remote.stop();
    pendingPairs.delete(host);
    await saveRecord(record);
    const oldSession = sessions.get(host);
    if (oldSession) {
      oldSession.stopped = true;
      oldSession.remote?.stop();
      sessions.delete(host);
    }
    await connectRecord(record, true);
    return publicDevice(record);
  } catch (error) {
    pending.remote.stop();
    pendingPairs.delete(host);
    throw error;
  }
}

function sessionFor(deviceId) {
  if (typeof deviceId !== 'string' || !deviceId.startsWith('remote:')) return null;
  return sessions.get(deviceId.slice(7)) || null;
}

export function hasRemoteDevice(deviceId) { return typeof deviceId === 'string' && deviceId.startsWith('remote:'); }

export function sendRemoteCommand(deviceId, command) {
  const session = sessionFor(deviceId);
  if (!session?.ready || !session.remote) throw new Error('TV:n är inte ansluten ännu.');
  if (appPackages[command]) session.remote.sendAppLink(`market://launch?id=${appPackages[command]}`);
  else if (keyCodes[command] !== undefined) session.remote.sendKey(keyCodes[command]);
  else throw new Error('Okänt fjärrkommando.');
}

export function sendRemoteText(deviceId, text) {
  const session = sessionFor(deviceId);
  if (!session?.ready || !session.remote) throw new Error('TV:n är inte ansluten ännu.');
  session.remote.sendText(text);
}

export function remoteMedia(deviceId) {
  const currentApp = sessionFor(deviceId)?.currentApp;
  if (!currentApp) return null;
  const app = appNames[currentApp] || currentApp.split('.').filter(Boolean).at(-1) || 'Google TV';
  return { packageName: currentApp, app, title: app, subtitle: 'Google TV', state: 'active', active: true };
}

export function stopRemoteConnections() {
  for (const session of sessions.values()) {
    session.stopped = true;
    clearTimeout(session.reconnectTimer);
    session.remote?.stop();
  }
  for (const pending of pendingPairs.values()) pending.remote.stop();
  sessions.clear();
  pendingPairs.clear();
}
