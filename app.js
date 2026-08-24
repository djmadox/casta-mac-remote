const toast = document.querySelector('#toast');
const remote = document.querySelector('#remote');
const deviceList = document.querySelector('#deviceList');
const emptyDevices = document.querySelector('#emptyDevices');
const currentRoom = document.querySelector('#currentRoom');
const onlinePill = document.querySelector('#onlinePill');
const connectionLabel = document.querySelector('#connectionLabel');
const connectionState = document.querySelector('#connectionState');
const connectionModal = document.querySelector('#connectionModal');
const settingsModal = document.querySelector('#settingsModal');
const connectionForm = document.querySelector('#connectionForm');
const connectionError = document.querySelector('#connectionError');
const connectButton = document.querySelector('#connectButton');
const pageParams = new URLSearchParams(window.location.search);
document.body.classList.toggle('desktop', pageParams.has('desktop'));
let viewMode = pageParams.get('view') === 'compact' || localStorage.getItem('casta-view-mode') === 'compact' ? 'compact' : 'full';
let selectedDevice = localStorage.getItem('casta-device') || '';
let toastTimer;
let mediaRequestActive = false;

function showToast(message, duration = 1600) {
  toast.querySelector('span').textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

function setViewMode(mode, { save = true } = {}) {
  viewMode = mode === 'compact' ? 'compact' : 'full';
  document.body.classList.toggle('compact', viewMode === 'compact');
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === viewMode));
  if (save) localStorage.setItem('casta-view-mode', viewMode);
  window.castaDesktop?.setViewMode(viewMode);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Anropet misslyckades.');
  return result;
}

function setConnection(device) {
  selectedDevice = device?.id || '';
  if (selectedDevice) localStorage.setItem('casta-device', selectedDevice);
  else localStorage.removeItem('casta-device');
  const connected = Boolean(device?.connected);
  currentRoom.textContent = connected ? device.name : 'Välj Chromecast';
  connectionLabel.textContent = connected ? 'Ansluten till' : 'Inte ansluten';
  onlinePill.textContent = connected ? 'Online' : 'Offline';
  onlinePill.classList.toggle('offline', !connected);
  connectionState.classList.toggle('offline', !connected);
  connectionState.querySelector('span').textContent = connected ? 'Lokal Wi‑Fi-anslutning' : 'Ingen anslutning';
  remote.classList.toggle('disconnected', !connected);
  if (!connected) document.querySelector('#nowPlaying').hidden = true;
}

function makeDeviceCard(device) {
  const card = document.createElement('button');
  card.className = `device-card${device.id === selectedDevice ? ' active' : ''}`;
  const art = document.createElement('span');
  art.className = 'device-art living';
  const copy = document.createElement('span');
  copy.className = 'device-copy';
  const name = document.createElement('strong');
  name.textContent = device.name;
  const status = document.createElement('small');
  const dot = document.createElement('i');
  dot.className = `status-dot${device.connected ? '' : ' idle'}`;
  status.append(dot, document.createTextNode(device.connected ? ' Ansluten' : ` ${device.state}`));
  copy.append(name, status);
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-chevron');
  arrow.append(use);
  card.append(art, copy, arrow);
  card.addEventListener('click', () => {
    setConnection(device);
    renderDevices(window.castaDevices || []);
    showToast(`Ansluten till ${device.name}`);
  });
  return card;
}

function renderDevices(devices) {
  window.castaDevices = devices;
  deviceList.replaceChildren(...devices.map(makeDeviceCard));
  emptyDevices.hidden = devices.length > 0;
  const selected = devices.find((device) => device.id === selectedDevice && device.connected)
    || devices.find((device) => device.connected);
  setConnection(selected || null);
}

function renderProfile(profile) {
  if (!profile?.name) return;
  document.querySelector('#profileName').textContent = profile.name;
  const parts = profile.name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0].slice(0, 2);
  document.querySelector('#profileInitials').textContent = initials.toLocaleUpperCase('sv-SE');
}

async function refreshStatus({ quiet = true } = {}) {
  try {
    const status = await api('/api/status');
    renderProfile(status.profile);
    renderDevices(status.devices.filter((device) => device.connected));
    if (!status.adbAvailable && !quiet) showToast('Android Platform Tools saknas.', 3000);
  } catch (error) {
    setConnection(null);
    if (!quiet) showToast(error.message, 3000);
  }
}

const mediaColors = {
  'Prime Video': ['#1268a6', '#08253e'], Spotify: ['#1db954', '#102b1a'], Netflix: ['#e50914', '#24080b'],
  YouTube: ['#ff1b1b', '#3b0b0b'], 'Disney+': ['#3857c8', '#111a46'], Max: ['#7654d7', '#21143f']
};

async function refreshMedia() {
  if (!selectedDevice || mediaRequestActive) return;
  mediaRequestActive = true;
  try {
    const result = await api(`/api/media?device=${encodeURIComponent(selectedDevice)}`);
    const media = result.media;
    const panel = document.querySelector('#nowPlaying');
    panel.hidden = !media;
    if (!media) return;
    document.querySelector('#mediaState').textContent = media.state === 'playing' ? 'Spelar nu' : 'Pausad';
    document.querySelector('#mediaTitle').textContent = media.title || media.app;
    document.querySelector('#mediaSubtitle').textContent = media.subtitle || media.app;
    document.querySelector('#posterApp').textContent = media.app.length > 10 ? media.app.slice(0, 10) : media.app;
    const colors = mediaColors[media.app] || ['#60798a', '#1c2b35'];
    document.querySelector('#mediaPoster').style.background = `linear-gradient(160deg,${colors[0]},${colors[1]} 70%)`;
    playButton.classList.toggle('paused', media.state !== 'playing');
    playButton.setAttribute('aria-label', media.state === 'playing' ? 'Pausa' : 'Spela');
  } catch {
    document.querySelector('#nowPlaying').hidden = true;
  } finally { mediaRequestActive = false; }
}

async function sendCommand(command, label) {
  if (!selectedDevice) {
    openConnection();
    showToast('Anslut en Chromecast först.');
    return false;
  }
  try {
    await api('/api/command', { method: 'POST', body: JSON.stringify({ device: selectedDevice, command }) });
    if (label) showToast(label);
    return true;
  } catch (error) {
    showToast(error.message, 3000);
    if (/device|offline|closed|failed to connect/i.test(error.message)) refreshStatus();
    return false;
  }
}

document.querySelectorAll('[data-command]').forEach((button) => {
  if (button.id === 'playButton') return;
  button.addEventListener('click', () => sendCommand(button.dataset.command, button.dataset.action));
});

const playButton = document.querySelector('#playButton');
playButton.addEventListener('click', async () => {
  if (!await sendCommand('playPause')) return;
  const isPaused = playButton.classList.toggle('paused');
  playButton.setAttribute('aria-label', isPaused ? 'Spela' : 'Pausa');
  showToast(isPaused ? 'Pausad' : 'Spelar');
  window.setTimeout(refreshMedia, 450);
});

const keyboardModal = document.querySelector('#keyboardModal');
const tvInput = document.querySelector('#tvInput');
function openKeyboard() {
  if (!selectedDevice) { openConnection(); showToast('Anslut en Chromecast först.'); return; }
  keyboardModal.hidden = false;
  window.setTimeout(() => tvInput.focus(), 50);
}
function closeKeyboard() { keyboardModal.hidden = true; }

document.querySelector('#keyboardButton').addEventListener('click', openKeyboard);
document.querySelector('#closeKeyboard').addEventListener('click', closeKeyboard);
keyboardModal.addEventListener('click', (event) => { if (event.target === keyboardModal) closeKeyboard(); });
document.querySelector('#sendText').addEventListener('click', async () => {
  const value = tvInput.value.trim();
  if (!value) { tvInput.focus(); return; }
  try {
    await api('/api/text', { method: 'POST', body: JSON.stringify({ device: selectedDevice, text: value }) });
    closeKeyboard();
    showToast('Texten skickades till TV:n');
    tvInput.value = '';
  } catch (error) { showToast(error.message, 3000); }
});
tvInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') document.querySelector('#sendText').click(); });

function openConnection() {
  connectionError.classList.remove('visible');
  connectionError.textContent = '';
  connectionModal.hidden = false;
  window.setTimeout(() => document.querySelector('#deviceHost').focus(), 50);
}
function closeConnection() { connectionModal.hidden = true; }
document.querySelector('#addDevice').addEventListener('click', openConnection);
document.querySelector('#roomPicker').addEventListener('click', openConnection);
document.querySelector('#closeConnection').addEventListener('click', closeConnection);
connectionModal.addEventListener('click', (event) => { if (event.target === connectionModal) closeConnection(); });

function openSettings() { settingsModal.hidden = false; }
function closeSettings() { settingsModal.hidden = true; }
document.querySelector('#settingsButton').addEventListener('click', openSettings);
document.querySelector('#compactSettings').addEventListener('click', openSettings);
document.querySelector('#closeSettings').addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) closeSettings(); });
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  setViewMode(button.dataset.view);
  window.setTimeout(closeSettings, 180);
}));
document.querySelector('#manageConnection').addEventListener('click', () => { closeSettings(); openConnection(); });

document.querySelector('#discoverButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = document.querySelector('#discoverStatus');
  button.disabled = true;
  status.textContent = 'Söker på ditt lokala nätverk…';
  try {
    const result = await api('/api/discover');
    const pairing = result.services.find((service) => service.service === 'pairing');
    const connect = result.services.find((service) => service.service === 'connect' && (!pairing || service.host === pairing.host));
    const found = pairing || connect;
    if (!found) throw new Error('Ingen enhet hittades. Kontrollera att Trådlös felsökning är aktiv.');
    document.querySelector('#deviceHost').value = found.host;
    if (pairing) document.querySelector('#pairPort').value = pairing.port;
    if (connect) document.querySelector('#connectPort').value = connect.port;
    status.textContent = `Hittade ${found.host}`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

connectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  connectionError.classList.remove('visible');
  const host = document.querySelector('#deviceHost').value.trim();
  const pairPort = document.querySelector('#pairPort').value.trim();
  const code = document.querySelector('#pairCode').value.trim();
  const connectPort = document.querySelector('#connectPort').value.trim();
  connectButton.disabled = true;
  connectButton.textContent = pairPort || code ? 'Parar med TV:n…' : 'Ansluter…';
  try {
    let connectedDevice = null;
    if (pairPort || code) {
      const pairResult = await api('/api/pair', { method: 'POST', body: JSON.stringify({ host, port: pairPort, code }) });
      connectedDevice = pairResult.device;
      if (!connectedDevice && !connectPort && pairResult.connectService) {
        document.querySelector('#connectPort').value = pairResult.connectService.port;
      }
      connectButton.textContent = 'Ansluter…';
    }
    let activePort = document.querySelector('#connectPort').value.trim();
    if (!connectedDevice && !activePort) {
      const discovered = await api('/api/discover');
      const service = discovered.services.find((item) => item.service === 'connect' && item.host === host);
      activePort = service ? String(service.port) : '';
    }
    if (!connectedDevice) {
      if (!activePort) throw new Error('Parningen lyckades, men anslutningsporten hittades inte ännu. Vänta några sekunder och tryck Sök automatiskt.');
      const result = await api('/api/connect', { method: 'POST', body: JSON.stringify({ host, port: activePort }) });
      connectedDevice = result.device;
    }
    selectedDevice = connectedDevice.id;
    localStorage.setItem('casta-device', selectedDevice);
    await refreshStatus();
    closeConnection();
    showToast(`Ansluten till ${connectedDevice.name}`, 2500);
  } catch (error) {
    connectionError.textContent = error.message;
    connectionError.classList.add('visible');
  } finally {
    connectButton.disabled = false;
    connectButton.textContent = 'Para och anslut';
  }
});

const keyMap = {
  ArrowUp: '.dpad-key.up', ArrowRight: '.dpad-key.right', ArrowDown: '.dpad-key.down', ArrowLeft: '.dpad-key.left',
  Enter: '.select-key', Escape: '[data-command="back"]', ' ': '#playButton'
};
document.addEventListener('keydown', (event) => {
  if (!keyboardModal.hidden || !connectionModal.hidden || !settingsModal.hidden) {
    if (event.key === 'Escape') { closeKeyboard(); closeConnection(); closeSettings(); }
    return;
  }
  const selector = keyMap[event.key];
  if (!selector || event.repeat) return;
  event.preventDefault();
  const button = document.querySelector(selector);
  button.classList.add('pressed');
  button.click();
});
document.addEventListener('keyup', (event) => {
  const selector = keyMap[event.key];
  if (selector) document.querySelector(selector)?.classList.remove('pressed');
});

refreshStatus({ quiet: false });
setViewMode(viewMode, { save: false });
window.setInterval(() => refreshStatus(), 8000);
window.setInterval(refreshMedia, 4000);
window.setTimeout(refreshMedia, 500);
if (new URLSearchParams(window.location.search).has('connect')) openConnection();
