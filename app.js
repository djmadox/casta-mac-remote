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
let language = ['en', 'sv'].includes(pageParams.get('lang'))
  ? pageParams.get('lang')
  : localStorage.getItem('casta-language') || (navigator.language.toLowerCase().startsWith('sv') ? 'sv' : 'en');
let selectedDevice = localStorage.getItem('casta-device') || '';
let toastTimer;
let mediaRequestActive = false;
let pairingHost = '';

const translations = {
  en: {
    'document.title': 'Casta — Remote for Mac',
    'devices.title': 'My devices', 'devices.empty': 'No paired devices yet.', 'devices.add': 'Add device', 'devices.connected': 'Connected', 'devices.connecting': 'Connecting', 'devices.offline': 'Offline',
    'profile.computer': 'This computer',
    'status.choose': 'Choose Chromecast', 'status.connectedTo': 'Connected to', 'status.notConnected': 'Not connected',
    'status.online': 'Online', 'status.offline': 'Offline', 'status.local': 'Local Wi‑Fi connection', 'status.none': 'No connection',
    'remote.label': 'Remote control', 'remote.heading': 'What would you like to watch?', 'remote.description': 'Control your Chromecast directly from your Mac.', 'remote.connect': 'Connect a device',
    'media.on': 'Now on', 'media.playing': 'Now playing', 'media.paused': 'Paused', 'media.active': 'Open on TV', 'media.none': 'No media',
    'keyboard.label': 'Type on your TV', 'keyboard.title': 'Keyboard', 'keyboard.placeholder': 'Type something…', 'keyboard.send': 'Send to TV',
    'connect.label': 'Google TV · local connection', 'connect.title': 'Connect your Chromecast',
    'connect.step1': 'Make sure your Mac and TV are connected to the <strong>same Wi‑Fi</strong>.',
    'connect.step2': 'Choose <strong>Find TV</strong> and select your Google TV.',
    'connect.step3': 'Casta asks the TV to show a code. Enter it once, then Casta reconnects automatically.',
    'connect.discover': 'Find TV', 'connect.sameWifi': 'Your Mac and TV must be on the same Wi‑Fi.', 'connect.ip': 'TV IP address', 'connect.name': 'TV name',
    'connect.pairPort': 'Pairing port', 'connect.pairCode': 'Pairing code', 'connect.connectPort': 'Connection port · optional', 'connect.auto': 'Found automatically',
    'connect.standardHint': 'No developer mode or Google sign-in is needed.', 'connect.showCode': 'Show code on TV', 'connect.finish': 'Connect', 'connect.requesting': 'Asking the TV to show a code…', 'connect.codePrompt': 'Enter the six-character code shown on your TV.',
    'connect.advanced': 'Advanced connection', 'connect.advancedDescription': 'Optional ADB tools for deeper media information', 'connect.advancedDiscover': 'Find ADB address', 'connect.debugRequired': 'Wireless debugging must be enabled.', 'connect.advancedSubmit': 'Connect with ADB',
    'settings.title': 'Settings', 'settings.viewMode': 'View mode', 'settings.full': 'Full view', 'settings.fullDescription': 'Devices, media and remote',
    'settings.compact': 'Remote only', 'settings.compactDescription': 'A small window on your desktop', 'settings.language': 'Language',
    'settings.manage': 'Manage Chromecast', 'settings.manageDescription': 'Pairing and connection',
    'aria.openSettings': 'Open settings', 'aria.openKeyboard': 'Open keyboard', 'aria.close': 'Close', 'aria.remote': 'Chromecast remote', 'aria.volume': 'Volume control', 'aria.play': 'Play', 'aria.pause': 'Pause',
    'command.up': 'Up', 'command.right': 'Right', 'command.down': 'Down', 'command.left': 'Left', 'command.select': 'Select', 'command.back': 'Back',
    'command.home': 'Home', 'command.mute': 'Mute', 'command.youtube': 'Opening YouTube', 'command.netflix': 'Opening Netflix',
    'command.power': 'Power', 'command.input': 'Change input', 'command.assistant': 'Google Assistant', 'command.volumeUp': 'Volume up',
    'command.volumeDown': 'Volume down', 'command.playPause': 'Play or pause',
    'toast.apiFailed': 'The request failed.', 'toast.connectFirst': 'Connect a Chromecast first.', 'toast.connected': 'Connected to {name}',
    'toast.missingAdb': 'Android Platform Tools is missing.', 'toast.textSent': 'Text sent to the TV', 'toast.paused': 'Paused', 'toast.playing': 'Playing',
    'discover.searching': 'Searching your local network…', 'discover.none': 'No Google TV found. Check that both devices are on the same Wi‑Fi.', 'discover.found': 'Found {count} TV',
    'connect.pairing': 'Pairing with your TV…', 'connect.connecting': 'Connecting…',
    'connect.noPort': 'Pairing succeeded, but the connection port was not found yet. Wait a few seconds and choose Search automatically.'
  },
  sv: {
    'document.title': 'Casta — fjärrkontroll för Mac',
    'devices.title': 'Mina enheter', 'devices.empty': 'Ingen parkopplad enhet ännu.', 'devices.add': 'Lägg till enhet', 'devices.connected': 'Ansluten', 'devices.connecting': 'Ansluter', 'devices.offline': 'Offline',
    'profile.computer': 'Den här datorn',
    'status.choose': 'Välj Chromecast', 'status.connectedTo': 'Ansluten till', 'status.notConnected': 'Inte ansluten',
    'status.online': 'Online', 'status.offline': 'Offline', 'status.local': 'Lokal Wi‑Fi-anslutning', 'status.none': 'Ingen anslutning',
    'remote.label': 'Fjärrkontroll', 'remote.heading': 'Vad vill du titta på?', 'remote.description': 'Styr din Chromecast direkt från din Mac.', 'remote.connect': 'Anslut en enhet',
    'media.on': 'Nu på', 'media.playing': 'Spelar nu', 'media.paused': 'Pausad', 'media.active': 'Öppen på TV:n', 'media.none': 'Ingen media',
    'keyboard.label': 'Skriv på TV:n', 'keyboard.title': 'Tangentbord', 'keyboard.placeholder': 'Skriv något…', 'keyboard.send': 'Skicka till TV',
    'connect.label': 'Google TV · lokal anslutning', 'connect.title': 'Anslut din Chromecast',
    'connect.step1': 'Se till att din Mac och TV är anslutna till <strong>samma Wi‑Fi</strong>.',
    'connect.step2': 'Välj <strong>Hitta TV</strong> och välj din Google TV.',
    'connect.step3': 'Casta ber TV:n visa en kod. Skriv in den en gång, sedan återansluter Casta automatiskt.',
    'connect.discover': 'Hitta TV', 'connect.sameWifi': 'Mac och TV måste vara på samma Wi‑Fi.', 'connect.ip': 'TV:ns IP-adress', 'connect.name': 'TV:ns namn',
    'connect.pairPort': 'Parningsport', 'connect.pairCode': 'Parningskod', 'connect.connectPort': 'Anslutningsport · valfri', 'connect.auto': 'Hittas automatiskt',
    'connect.standardHint': 'Varken utvecklarläge eller Google-inloggning behövs.', 'connect.showCode': 'Visa kod på TV:n', 'connect.finish': 'Anslut', 'connect.requesting': 'Ber TV:n visa en kod…', 'connect.codePrompt': 'Skriv den sex tecken långa koden som visas på TV:n.',
    'connect.advanced': 'Avancerad anslutning', 'connect.advancedDescription': 'Valfria ADB-verktyg för mer medieinformation', 'connect.advancedDiscover': 'Hitta ADB-adress', 'connect.debugRequired': 'Trådlös felsökning måste vara aktiv.', 'connect.advancedSubmit': 'Anslut med ADB',
    'settings.title': 'Inställningar', 'settings.viewMode': 'Visningsläge', 'settings.full': 'Fullständig vy', 'settings.fullDescription': 'Enheter, media och fjärrkontroll',
    'settings.compact': 'Endast fjärrkontroll', 'settings.compactDescription': 'Ett litet fönster på skrivbordet', 'settings.language': 'Språk',
    'settings.manage': 'Hantera Chromecast', 'settings.manageDescription': 'Parning och anslutning',
    'aria.openSettings': 'Öppna inställningar', 'aria.openKeyboard': 'Öppna tangentbord', 'aria.close': 'Stäng', 'aria.remote': 'Chromecast-fjärrkontroll', 'aria.volume': 'Volymkontroll', 'aria.play': 'Spela', 'aria.pause': 'Pausa',
    'command.up': 'Upp', 'command.right': 'Höger', 'command.down': 'Ner', 'command.left': 'Vänster', 'command.select': 'Välj', 'command.back': 'Tillbaka',
    'command.home': 'Hem', 'command.mute': 'Stäng av ljud', 'command.youtube': 'Öppnar YouTube', 'command.netflix': 'Öppnar Netflix',
    'command.power': 'Ström', 'command.input': 'Byt ingång', 'command.assistant': 'Google-assistent', 'command.volumeUp': 'Volym upp',
    'command.volumeDown': 'Volym ner', 'command.playPause': 'Spela eller pausa',
    'toast.apiFailed': 'Anropet misslyckades.', 'toast.connectFirst': 'Anslut en Chromecast först.', 'toast.connected': 'Ansluten till {name}',
    'toast.missingAdb': 'Android Platform Tools saknas.', 'toast.textSent': 'Texten skickades till TV:n', 'toast.paused': 'Pausad', 'toast.playing': 'Spelar',
    'discover.searching': 'Söker på ditt lokala nätverk…', 'discover.none': 'Ingen Google TV hittades. Kontrollera att båda enheterna är på samma Wi‑Fi.', 'discover.found': 'Hittade {count} TV',
    'connect.pairing': 'Parar med TV:n…', 'connect.connecting': 'Ansluter…',
    'connect.noPort': 'Parningen lyckades, men anslutningsporten hittades inte ännu. Vänta några sekunder och tryck Sök automatiskt.'
  }
};

function t(key, values = {}) {
  const template = translations[language]?.[key] || translations.en[key] || key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), template);
}

function localizeError(message) {
  if (language === 'sv') return message;
  const errors = [
    [/Kontrollera IP-adress, parningsport och sexsiffrig kod\./, 'Check the IP address, pairing port and six-digit code.'],
    [/Kontrollera IP-adress och anslutningsport\./, 'Check the IP address and connection port.'],
    [/Ingen giltig enhet är vald\./, 'No valid device is selected.'],
    [/Parningen misslyckades\./, 'Pairing failed.'],
    [/Anslutningen misslyckades\./, 'Connection failed.'],
    [/TV:n svarade men blev inte tillgänglig\. Försök igen\./, 'The TV responded but did not become available. Try again.'],
    [/ADB hittades inte\. Installera Android SDK Platform Tools\./, 'ADB was not found. Install Android SDK Platform Tools.'],
    [/Texten måste vara 1–200 tecken\./, 'Text must be 1–200 characters.'],
    [/Kontrollera TV:ns IP-adress\./, "Check the TV's IP address."],
    [/TV:n visade ingen kod\./, 'The TV did not show a code.'],
    [/Ange den sex tecken långa koden som visas på TV:n\./, 'Enter the six-character code shown on your TV.'],
    [/Koden kunde inte skickas\./, 'The code could not be sent.'],
    [/Koden godkändes inte av TV:n\./, 'The TV did not accept the code.'],
    [/Parkopplingen har gått ut\./, 'The pairing request has expired.'],
    [/TV:n godkände inte koden i tid\./, 'The TV did not accept the code in time.'],
    [/TV:n är inte ansluten ännu\./, 'The TV is not connected yet.']
  ];
  return errors.find(([pattern]) => pattern.test(message))?.[1] || message;
}

function applyLanguage(nextLanguage, { save = true } = {}) {
  language = nextLanguage === 'sv' ? 'sv' : 'en';
  document.documentElement.lang = language;
  document.title = t('document.title');
  document.documentElement.style.setProperty('--remote-status', `"${t('remote.connect')}"`);
  document.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((element) => { element.innerHTML = t(element.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === language));
  document.querySelectorAll('[data-command]').forEach((button) => button.setAttribute('aria-label', t(`command.${button.dataset.command}`)));
  connectButton.textContent = pairingHost ? t('connect.finish') : t('connect.showCode');
  if (save) localStorage.setItem('casta-language', language);
  if (window.castaDevices) renderDevices(window.castaDevices);
  refreshMedia();
}

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
  if (!response.ok) throw new Error(localizeError(result.error || t('toast.apiFailed')));
  return result;
}

function setConnection(device) {
  selectedDevice = device?.id || '';
  if (selectedDevice) localStorage.setItem('casta-device', selectedDevice);
  else localStorage.removeItem('casta-device');
  const connected = Boolean(device?.connected);
  currentRoom.textContent = connected ? device.name : t('status.choose');
  connectionLabel.textContent = connected ? t('status.connectedTo') : t('status.notConnected');
  onlinePill.textContent = connected ? t('status.online') : t('status.offline');
  onlinePill.classList.toggle('offline', !connected);
  connectionState.classList.toggle('offline', !connected);
  connectionState.querySelector('span').textContent = connected ? t('status.local') : t('status.none');
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
  const deviceState = device.connected ? t('devices.connected') : device.state === 'connecting' ? t('devices.connecting') : t('devices.offline');
  status.append(dot, document.createTextNode(` ${deviceState}`));
  copy.append(name, status);
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-chevron');
  arrow.append(use);
  card.append(art, copy, arrow);
  card.addEventListener('click', () => {
    setConnection(device);
    renderDevices(window.castaDevices || []);
    showToast(t('toast.connected', { name: device.name }));
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
  document.querySelector('#profileInitials').textContent = initials.toLocaleUpperCase(language === 'sv' ? 'sv-SE' : 'en-US');
}

async function refreshStatus({ quiet = true } = {}) {
  try {
    const status = await api('/api/status');
    renderProfile(status.profile);
    renderDevices(status.devices);
  } catch (error) {
    setConnection(null);
    if (!quiet) showToast(localizeError(error.message), 3000);
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
    document.querySelector('#mediaState').textContent = media.state === 'playing' ? t('media.playing') : media.state === 'paused' ? t('media.paused') : t('media.active');
    document.querySelector('#mediaTitle').textContent = media.title || media.app;
    document.querySelector('#mediaSubtitle').textContent = media.subtitle || media.app;
    document.querySelector('#posterApp').textContent = media.app.length > 10 ? media.app.slice(0, 10) : media.app;
    const colors = mediaColors[media.app] || ['#60798a', '#1c2b35'];
    document.querySelector('#mediaPoster').style.background = `linear-gradient(160deg,${colors[0]},${colors[1]} 70%)`;
    playButton.classList.toggle('paused', media.state === 'paused');
    playButton.setAttribute('aria-label', media.state === 'paused' ? t('aria.play') : t('aria.pause'));
  } catch {
    document.querySelector('#nowPlaying').hidden = true;
  } finally { mediaRequestActive = false; }
}

async function sendCommand(command, label) {
  if (!selectedDevice) {
    openConnection();
    showToast(t('toast.connectFirst'));
    return false;
  }
  try {
    await api('/api/command', { method: 'POST', body: JSON.stringify({ device: selectedDevice, command }) });
    if (label) showToast(label);
    return true;
  } catch (error) {
    showToast(localizeError(error.message), 3000);
    if (/device|offline|closed|failed to connect/i.test(error.message)) refreshStatus();
    return false;
  }
}

document.querySelectorAll('[data-command]').forEach((button) => {
  if (button.id === 'playButton') return;
  button.addEventListener('click', () => sendCommand(button.dataset.command, t(`command.${button.dataset.command}`)));
});

const playButton = document.querySelector('#playButton');
playButton.addEventListener('click', async () => {
  if (!await sendCommand('playPause')) return;
  const isPaused = playButton.classList.toggle('paused');
  playButton.setAttribute('aria-label', isPaused ? t('aria.play') : t('aria.pause'));
  showToast(isPaused ? t('toast.paused') : t('toast.playing'));
  window.setTimeout(refreshMedia, 450);
});

const keyboardModal = document.querySelector('#keyboardModal');
const tvInput = document.querySelector('#tvInput');
function openKeyboard() {
  if (!selectedDevice) { openConnection(); showToast(t('toast.connectFirst')); return; }
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
    showToast(t('toast.textSent'));
    tvInput.value = '';
  } catch (error) { showToast(localizeError(error.message), 3000); }
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
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => applyLanguage(button.dataset.language)));
document.querySelector('#manageConnection').addEventListener('click', () => { closeSettings(); openConnection(); });

function resetStandardPairing() {
  pairingHost = '';
  document.querySelector('#codeStep').hidden = true;
  document.querySelector('#pairCode').required = false;
  document.querySelector('#pairCode').value = '';
  document.querySelector('#deviceHost').readOnly = false;
  document.querySelector('#deviceName').readOnly = false;
  document.querySelector('#standardHint').textContent = t('connect.standardHint');
  connectButton.textContent = t('connect.showCode');
}

function renderDiscoveredDevices(devices) {
  const container = document.querySelector('#discoveredDevices');
  container.replaceChildren(...devices.map((device) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'discovered-device';
    const icon = document.createElement('i');
    icon.innerHTML = '<svg><use href="#i-cast"></use></svg>';
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    const address = document.createElement('small');
    name.textContent = device.name;
    address.textContent = device.host;
    copy.append(name, address);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-chevron');
    arrow.append(use);
    button.append(icon, copy, arrow);
    button.addEventListener('click', () => {
      resetStandardPairing();
      document.querySelectorAll('.discovered-device').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelector('#deviceHost').value = device.host;
      document.querySelector('#deviceName').value = device.name;
    });
    return button;
  }));
}

document.querySelector('#discoverButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = document.querySelector('#discoverStatus');
  button.disabled = true;
  status.textContent = t('discover.searching');
  try {
    const result = await api('/api/discover');
    if (!result.devices.length) throw new Error(t('discover.none'));
    renderDiscoveredDevices(result.devices);
    status.textContent = t('discover.found', { count: result.devices.length });
    if (result.devices.length === 1) document.querySelector('.discovered-device').click();
  } catch (error) {
    renderDiscoveredDevices([]);
    status.textContent = localizeError(error.message);
  } finally { button.disabled = false; }
});

document.querySelector('#deviceHost').addEventListener('input', () => {
  if (pairingHost && document.querySelector('#deviceHost').value.trim() !== pairingHost) resetStandardPairing();
});

connectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  connectionError.classList.remove('visible');
  const host = document.querySelector('#deviceHost').value.trim();
  const name = document.querySelector('#deviceName').value.trim() || 'Google TV';
  connectButton.disabled = true;
  try {
    if (!pairingHost) {
      connectButton.textContent = t('connect.requesting');
      await api('/api/remote/pair/start', { method: 'POST', body: JSON.stringify({ host, name }) });
      pairingHost = host;
      document.querySelector('#deviceHost').readOnly = true;
      document.querySelector('#deviceName').readOnly = true;
      document.querySelector('#codeStep').hidden = false;
      document.querySelector('#pairCode').required = true;
      document.querySelector('#standardHint').textContent = t('connect.codePrompt');
      connectButton.textContent = t('connect.finish');
      document.querySelector('#pairCode').focus();
      return;
    }
    connectButton.textContent = t('connect.pairing');
    const result = await api('/api/remote/pair/finish', {
      method: 'POST',
      body: JSON.stringify({ host: pairingHost, code: document.querySelector('#pairCode').value.trim() })
    });
    selectedDevice = result.device.id;
    localStorage.setItem('casta-device', selectedDevice);
    resetStandardPairing();
    await refreshStatus();
    closeConnection();
    showToast(t('toast.connected', { name: result.device.name }), 2500);
  } catch (error) {
    connectionError.textContent = localizeError(error.message);
    connectionError.classList.add('visible');
  } finally {
    connectButton.disabled = false;
    connectButton.textContent = pairingHost ? t('connect.finish') : t('connect.showCode');
  }
});

document.querySelector('#advancedDiscoverButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = document.querySelector('#advancedDiscoverStatus');
  button.disabled = true;
  status.textContent = t('discover.searching');
  try {
    const result = await api('/api/advanced/discover');
    const pairing = result.services.find((service) => service.service === 'pairing');
    const connect = result.services.find((service) => service.service === 'connect' && (!pairing || service.host === pairing.host));
    const found = pairing || connect;
    if (!found) throw new Error(t('discover.none'));
    document.querySelector('#adbHost').value = found.host;
    if (pairing) document.querySelector('#adbPairPort').value = pairing.port;
    if (connect) document.querySelector('#adbConnectPort').value = connect.port;
    status.textContent = `${found.name} · ${found.host}`;
  } catch (error) { status.textContent = localizeError(error.message); }
  finally { button.disabled = false; }
});

document.querySelector('#adbConnectionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorBox = document.querySelector('#adbConnectionError');
  const button = document.querySelector('#adbConnectButton');
  errorBox.classList.remove('visible');
  const host = document.querySelector('#adbHost').value.trim();
  const pairPort = document.querySelector('#adbPairPort').value.trim();
  const code = document.querySelector('#adbPairCode').value.trim();
  let connectPort = document.querySelector('#adbConnectPort').value.trim();
  button.disabled = true;
  button.textContent = t('connect.pairing');
  try {
    if (pairPort || code) await api('/api/advanced/pair', { method: 'POST', body: JSON.stringify({ host, port: pairPort, code }) });
    if (!connectPort) {
      const discovered = await api('/api/advanced/discover');
      const service = discovered.services.find((item) => item.service === 'connect' && item.host === host);
      connectPort = service ? String(service.port) : '';
    }
    if (!connectPort) throw new Error(t('connect.noPort'));
    button.textContent = t('connect.connecting');
    const result = await api('/api/advanced/connect', { method: 'POST', body: JSON.stringify({ host, port: connectPort }) });
    selectedDevice = result.device.id;
    localStorage.setItem('casta-device', selectedDevice);
    await refreshStatus();
    closeConnection();
    showToast(t('toast.connected', { name: result.device.name }), 2500);
  } catch (error) {
    errorBox.textContent = localizeError(error.message);
    errorBox.classList.add('visible');
  } finally {
    button.disabled = false;
    button.textContent = t('connect.advancedSubmit');
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
applyLanguage(language, { save: false });
setViewMode(viewMode, { save: false });
window.setInterval(() => refreshStatus(), 8000);
window.setInterval(refreshMedia, 4000);
window.setTimeout(refreshMedia, 500);
if (pageParams.has('connect')) openConnection();
if (pageParams.has('settings')) openSettings();
