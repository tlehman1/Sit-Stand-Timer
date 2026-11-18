// Service worker: owns the timer. All state lives in chrome.storage, so Chrome can
// shut the worker down at any time and it picks up again on the next event.

import {
  PHASES,
  SNOOZE_MINUTES,
  loadSettings,
  loadState,
  minutesLeft,
  otherPhase,
  phaseMinutes,
  t,
} from './shared.js';

const ALARM_END = 'phase-end';
const ALARM_TICK = 'badge-tick';
const NOTIFICATION_ID = 'switch-prompt';
const POPUP_PORT = 'popup';
const MINUTE = 60_000;
// An alarm cannot fire sooner than 30 s after it was set.
const ALARM_MIN_DELAY = 30_000;

const BADGE_COLORS = {
  sit: '#4F46E5',
  stand: '#0F766E',
  paused: '#64748B',
  prompt: '#C2410C',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async function setState(patch) {
  const state = { ...(await loadState()), ...patch };
  await chrome.storage.local.set({ state });
  return state;
}

// Every state change runs through this queue so that overlapping events
// (an alarm and a button click, two quick clicks) cannot interleave.
let queue = Promise.resolve();

function enqueue(task) {
  queue = queue.then(() => task()).catch((error) => console.error(error));
  return queue;
}

// First start of the worker in a browser session (browser start, install, update).
// It is first in the queue, so every later event sees the restored state.
enqueue(async () => {
  const { booted } = await chrome.storage.session.get('booted');
  if (booted) return;
  await chrome.storage.session.set({ booted: true });
  await restoreSession();
});

async function restoreSession() {
  let state = await loadState();
  if (state.status === 'running' && state.endTime > Date.now()) {
    // Still inside the phase, e.g. after an update or a quick browser restart.
    state = await setState({ prompt: null });
    await scheduleAlarms(state.endTime);
  } else if (state.status === 'running' || state.status === 'waiting') {
    // The phase ran out while the browser was closed. Start fresh instead of ringing at launch.
    await clearAlarms();
    state = await setState({
      status: 'idle',
      endTime: null,
      remainingMs: null,
      durationMs: null,
      prompt: null,
    });
  }
  await dismissNotification();
  await updateBadge(state);
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

async function startPhase(phase, { durationMs, prompt = null } = {}) {
  const duration = durationMs ?? phaseMinutes(await loadSettings(), phase) * MINUTE;
  const endTime = Date.now() + duration;
  const state = await setState({
    status: 'running',
    phase,
    endTime,
    remainingMs: null,
    durationMs: duration,
    prompt,
  });
  await scheduleAlarms(endTime);
  await updateBadge(state);
}

async function start() {
  const state = await loadState();
  if (state.status === 'idle') await startPhase(state.phase);
}

async function pause() {
  const state = await loadState();
  if (state.status !== 'running') return;
  await clearAlarms();
  await updateBadge(
    await setState({
      status: 'paused',
      endTime: null,
      remainingMs: Math.max(0, state.endTime - Date.now()),
    }),
  );
}

async function resume() {
  const state = await loadState();
  if (state.status !== 'paused') return;
  const endTime = Date.now() + state.remainingMs;
  await updateBadge(await setState({ status: 'running', endTime, remainingMs: null }));
  await scheduleAlarms(endTime);
}

async function stop() {
  await clearAlarms();
  await updateBadge(
    await setState({
      status: 'idle',
      endTime: null,
      remainingMs: null,
      durationMs: null,
      prompt: null,
    }),
  );
  await dismissNotification();
}

// The user picked a position by hand: while idle it only preselects the phase,
// otherwise that phase starts right away with its full duration.
async function selectPhase({ phase }) {
  if (!PHASES.includes(phase)) return;
  const state = await loadState();
  if (state.status === 'idle') {
    await setState({ phase });
  } else if (state.phase !== phase || state.status === 'waiting') {
    await startPhase(phase);
    await dismissNotification();
  }
}

async function handlePhaseEnd() {
  const state = await loadState();
  if (state.status !== 'running') return;
  if (state.endTime - Date.now() > 1000) {
    // Woken up too early (e.g. the system clock changed): wait for the real end.
    await scheduleAlarms(state.endTime);
    return;
  }
  const settings = await loadSettings();
  const prompt = { to: otherPhase(state.phase), auto: settings.autoStart };
  if (settings.autoStart) {
    await startPhase(prompt.to, { prompt });
  } else {
    await clearAlarms();
    await updateBadge(
      await setState({ status: 'waiting', endTime: null, remainingMs: null, prompt }),
    );
  }
  await announce(prompt, settings);
}

// "Done": the desk is moved, the next phase begins.
async function confirmSwitch() {
  const state = await loadState();
  if (state.status === 'waiting') {
    await startPhase(state.prompt?.to ?? otherPhase(state.phase));
  } else if (state.prompt) {
    await setState({ prompt: null });
  }
  await dismissNotification();
}

// "Later": stay in the current position for a few more minutes.
async function snooze() {
  const state = await loadState();
  if (state.status !== 'waiting') return;
  await startPhase(state.phase, { durationMs: SNOOZE_MINUTES * MINUTE });
  await dismissNotification();
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

let endTimer = null;

async function scheduleAlarms(endTime) {
  await chrome.alarms.create(ALARM_END, { when: endTime });
  await scheduleTick(endTime);
  clearTimeout(endTimer);
  const delay = endTime - Date.now();
  if (delay < ALARM_MIN_DELAY) {
    // Too close for an alarm; the worker stays alive long enough for a plain timer.
    endTimer = setTimeout(() => enqueue(handlePhaseEnd), Math.max(0, delay));
  }
}

// One alarm per minute boundary, re-armed each time so it cannot drift away from the end time.
async function scheduleTick(endTime) {
  const boundariesLeft = Math.floor((endTime - Date.now() - 1000) / MINUTE);
  if (boundariesLeft >= 1) {
    await chrome.alarms.create(ALARM_TICK, { when: endTime - boundariesLeft * MINUTE });
  } else {
    await chrome.alarms.clear(ALARM_TICK);
  }
}

async function clearAlarms() {
  clearTimeout(endTimer);
  await Promise.all([chrome.alarms.clear(ALARM_END), chrome.alarms.clear(ALARM_TICK)]);
}

async function handleTick() {
  const state = await loadState();
  if (state.status !== 'running') return;
  await updateBadge(state);
  await scheduleTick(state.endTime);
}

// ---------------------------------------------------------------------------
// Toolbar icon
// ---------------------------------------------------------------------------

async function updateBadge(state) {
  let text = '';
  let color = BADGE_COLORS.paused;
  let title = t('extName');

  if (state.status === 'running') {
    text = String(minutesLeft(state.endTime - Date.now()));
    color = BADGE_COLORS[state.phase];
    title = t(state.phase === 'stand' ? 'tooltipStand' : 'tooltipSit', [text]);
  } else if (state.status === 'paused') {
    text = String(minutesLeft(state.remainingMs));
    title = t('tooltipPaused', [text]);
  } else if (state.status === 'waiting') {
    const toSit = state.prompt?.to === 'sit';
    text = toSit ? '↓' : '↑';
    color = BADGE_COLORS.prompt;
    title = t(toSit ? 'promptSitTitle' : 'promptStandTitle');
  }

  await Promise.all([
    chrome.action.setBadgeText({ text }),
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setBadgeTextColor({ color: '#FFFFFF' }),
    chrome.action.setTitle({ title }),
  ]);
}

// ---------------------------------------------------------------------------
// Reminder: a chime plus the popup under the toolbar icon
// ---------------------------------------------------------------------------

async function announce(prompt, settings) {
  const results = await Promise.allSettled([
    settings.soundEnabled ? playSound(prompt.to === 'stand' ? 'up' : 'down', settings.volume) : null,
    showReminder(prompt),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') console.warn(result.reason);
  }
}

// The reminder is the popup under the toolbar icon (it shows the reminder while the state
// holds a prompt). Chrome can only open it while its window is in front; otherwise a system
// notification stands in. The two are never shown at the same time.
async function showReminder(prompt) {
  if (await openPopup()) {
    await dismissNotification();
    return;
  }
  await showNotification(prompt);
  // With auto-start there is nothing to answer: the notification is the whole reminder.
  if (prompt.auto) await setState({ prompt: null });
}

async function openPopup(windowId) {
  const open = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] });
  if (open.length > 0) return true; // already open: it switches to the reminder by itself
  try {
    await chrome.action.openPopup(windowId === undefined ? {} : { windowId });
    return true;
  } catch {
    return false;
  }
}

// The popup was closed. An unanswered reminder moves on to a notification so that it does
// not get lost; with auto-start there was nothing to answer and the reminder is done.
async function handlePopupClosed() {
  const state = await loadState();
  if (!state.prompt) return;
  if (state.prompt.auto) await setState({ prompt: null });
  else if (state.status === 'waiting') await showNotification(state.prompt);
}

async function showNotification(prompt) {
  const toStand = prompt.to === 'stand';
  const options = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: t(toStand ? 'promptStandTitle' : 'promptSitTitle'),
    message: t(toStand ? 'promptStandText' : 'promptSitText'),
    priority: 2,
    requireInteraction: !prompt.auto,
    silent: true,
  };
  if (!prompt.auto) {
    options.buttons = [
      { title: t('btnDoneShort') },
      { title: t('btnSnoozeShort', [String(SNOOZE_MINUTES)]) },
    ];
  }
  await chrome.notifications.create(NOTIFICATION_ID, options);
}

function dismissNotification() {
  return chrome.notifications.clear(NOTIFICATION_ID);
}

// A click on the notification brings Chrome to the front and opens the popup there.
async function openFromNotification() {
  const target = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  await chrome.windows.update(target.id, { focused: true });
  // The window needs a moment to become the active one.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await openPopup(target.id)) {
      await dismissNotification();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// Service workers have no audio output, so the chime plays in an offscreen document.
// The document closes itself after playing; if it just did, the second attempt reopens it.
async function playSound(tone, volume) {
  const message = { target: 'offscreen', type: 'play', tone, volume };
  for (let attempt = 1; ; attempt += 1) {
    await ensureOffscreenDocument();
    try {
      await chrome.runtime.sendMessage(message);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const open = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (open.length > 0) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Plays a short chime when it is time to switch between sitting and standing.',
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_END) enqueue(handlePhaseEnd);
  else if (alarm.name === ALARM_TICK) enqueue(handleTick);
});

const commands = {
  start,
  pause,
  resume,
  stop,
  selectPhase,
  confirm: confirmSwitch,
  snooze,
  testSound: async () => playSound('up', (await loadSettings()).volume),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target || !Object.hasOwn(commands, message.type)) return undefined;
  enqueue(() => commands[message.type](message)).then(() => sendResponse({ ok: true }));
  return true;
});

// The popup keeps a connection open for as long as it is shown.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT) return;
  enqueue(dismissNotification);
  port.onDisconnect.addListener(() => enqueue(handlePopupClosed));
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === NOTIFICATION_ID) enqueue(openFromNotification);
});

chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
  if (id === NOTIFICATION_ID) enqueue(buttonIndex === 0 ? confirmSwitch : snooze);
});

// Nothing to do in these handlers, but being registered for them makes Chrome start
// the worker at browser launch, which restores the number on the icon (see restoreSession).
chrome.runtime.onStartup.addListener(() => {});
chrome.runtime.onInstalled.addListener(() => {});
