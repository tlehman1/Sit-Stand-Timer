import {
  DEFAULT_SETTINGS,
  SNOOZE_MINUTES,
  STRETCHES,
  clampMinutes,
  loadSettings,
  loadState,
  localizePage,
  minutesLeft,
  otherPhase,
  phaseMinutes,
  saveSettings,
  send,
  t,
} from './shared.js';

const $ = (id) => document.getElementById(id);
const phaseButtons = [...document.querySelectorAll('.phase')];
const minuteInputs = { sitMinutes: $('sitMinutes'), standMinutes: $('standMinutes') };

// Per status: [command sent to the service worker, label] for the two timer buttons.
const BUTTONS = {
  idle: { primary: ['start', 'btnStart'] },
  running: { primary: ['pause', 'btnPause'], secondary: ['stop', 'btnStop'] },
  paused: { primary: ['resume', 'btnResume'], secondary: ['stop', 'btnStop'] },
};

// The reminder opens by itself and takes the keyboard focus. Key presses are ignored for
// this long, so typing that was meant for a web page cannot answer it by accident.
const KEY_GUARD_MS = 1500;

let state;
let settings;
let ticker = null;
// The phase the user looks at while the other one runs (null: the running phase).
let viewPhase = null;
let reminderSince = null;
let closing = false;
// The exercise on screen after the reminder was answered (an id from STRETCHES), else null.
let stretch = null;

// --- Timer view ---

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// True while the popup shows the phase that is not running (the timer keeps going).
function previewing() {
  return viewPhase !== null && state.status !== 'idle' && viewPhase !== state.phase;
}

function drawClock() {
  let remaining = 0;
  let total = 0;
  if (previewing()) {
    remaining = total = phaseMinutes(settings, viewPhase) * 60_000;
  } else if (state.status === 'running') {
    remaining = state.endTime - Date.now();
    total = state.durationMs;
  } else if (state.status === 'paused') {
    remaining = state.remainingMs;
    total = state.durationMs;
  } else {
    remaining = total = phaseMinutes(settings, state.phase) * 60_000;
  }
  const fraction = total ? Math.min(1, Math.max(0, remaining / total)) : 1;
  $('time').textContent = formatTime(remaining);
  $('progress').style.strokeDashoffset = String(1000 * (1 - fraction));
}

function setButton(button, config) {
  button.hidden = !config;
  if (!config) return;
  const [command, label] = config;
  button.dataset.command = command;
  button.textContent = t(label);
}

function renderTimer() {
  if (!previewing()) viewPhase = null;
  const preview = viewPhase !== null;
  const status = preview ? 'idle' : state.status;
  const phase = viewPhase ?? state.phase;
  document.body.dataset.status = status;
  document.body.dataset.phase = phase;
  for (const button of phaseButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.phase === phase));
  }

  const captions = {
    idle: 'captionIdle',
    running: phase === 'stand' ? 'captionStand' : 'captionSit',
    paused: 'captionPaused',
  };
  if (preview) {
    // Name the phase that keeps running in the background and its minutes.
    const left = state.status === 'running' ? state.endTime - Date.now() : state.remainingMs;
    const key = state.phase === 'stand' ? 'captionOtherStand' : 'captionOtherSit';
    $('caption').textContent = t(key, [String(minutesLeft(left))]);
  } else {
    $('caption').textContent = t(captions[status] ?? 'captionIdle');
  }
  setButton($('primary'), BUTTONS[status]?.primary);
  setButton($('secondary'), BUTTONS[status]?.secondary);

  // Leave a field alone while the user is typing in it.
  for (const [key, input] of Object.entries(minuteInputs)) {
    if (document.activeElement !== input) input.value = settings[key];
  }
  $('durationHint').hidden = status === 'idle';
  $('resetDurations').hidden =
    settings.sitMinutes === DEFAULT_SETTINGS.sitMinutes &&
    settings.standMinutes === DEFAULT_SETTINGS.standMinutes;
  $('soundEnabled').checked = settings.soundEnabled;
  $('volume').value = settings.volume;
  $('volume').disabled = !settings.soundEnabled;
  $('testSound').disabled = !settings.soundEnabled;
  $('autoStart').checked = settings.autoStart;
  $('stretchEnabled').checked = settings.stretchEnabled;

  drawClock();
  ticker = status === 'running' ? setInterval(drawClock, 250) : null;
}

// --- Reminder view ---

function renderReminder(prompt) {
  const toStand = prompt.to === 'stand';
  const minutes = [String(phaseMinutes(settings, prompt.to))];

  document.body.dataset.to = prompt.to;
  $('reminderTitle').textContent = t(toStand ? 'promptStandTitle' : 'promptSitTitle');
  $('reminderText').textContent = t(toStand ? 'promptStandText' : 'promptSitText');
  if (prompt.auto) {
    $('reminderNext').textContent = t(toStand ? 'promptRunningStand' : 'promptRunningSit', minutes);
  } else {
    $('reminderNext').textContent = t(toStand ? 'promptNextStand' : 'promptNextSit', minutes);
  }
  $('confirm').textContent = t(prompt.auto ? 'btnOk' : 'btnDone');
  $('snooze').textContent = t('btnSnooze', [String(SNOOZE_MINUTES)]);
  $('snooze').hidden = prompt.auto;

  if (reminderSince === null) {
    reminderSince = performance.now();
    document.activeElement?.blur?.();
  }
}

// A reminder is open while the service worker holds a prompt (or waits for the answer).
function activePrompt() {
  if (state.prompt) return state.prompt;
  return state.status === 'waiting' ? { to: otherPhase(state.phase), auto: false } : null;
}

// The exercise keeps the colours of the reminder it follows (data-to stays as it is).
function renderStretch() {
  document.body.dataset.stretch = stretch;
  $('stretchTitle').textContent = t(`stretch_${stretch}_title`);
  $('stretchText').textContent = t(`stretch_${stretch}_text`);
  $('stretchHint').textContent = t(`stretch_${stretch}_hint`);
}

function render() {
  const prompt = stretch ? null : activePrompt();
  const view = stretch ? 'stretch' : prompt ? 'reminder' : 'timer';
  clearInterval(ticker);
  ticker = null;

  document.body.dataset.view = view;
  $('timerView').hidden = view !== 'timer';
  $('reminderView').hidden = view !== 'reminder';
  $('stretchView').hidden = view !== 'stretch';
  if (stretch) {
    renderStretch();
  } else if (prompt) {
    renderReminder(prompt);
  } else {
    reminderSince = null;
    delete document.body.dataset.to;
    renderTimer();
  }
  document.body.dataset.ready = '';
}

async function refresh() {
  if (closing) return;
  [state, settings] = await Promise.all([loadState(), loadSettings()]);
  render();
}

// --- Timer controls ---

for (const id of ['primary', 'secondary']) {
  $(id).addEventListener('click', (event) => {
    const { command } = event.currentTarget.dataset;
    // "Start" on the other phase switches over to it.
    const extra = command === 'start' && previewing() ? { phase: viewPhase } : undefined;
    viewPhase = null;
    send(command, extra);
  });
}

for (const button of phaseButtons) {
  button.addEventListener('click', () => {
    const { phase } = button.dataset;
    if (state.status === 'idle') {
      send('selectPhase', { phase });
    } else {
      // A running or paused phase keeps going: just look at the other one.
      viewPhase = phase;
      render();
    }
  });
}

// --- Reminder controls ---

async function answer(command, event) {
  const byKeyboard = event.detail === 0;
  if (byKeyboard && performance.now() - reminderSince < KEY_GUARD_MS) return;
  // With the exercises switched on, one follows the confirmed change instead of closing.
  const next = command === 'confirm' && STRETCHES.includes(state.prompt?.stretch) ? state.prompt.stretch : null;
  closing = true;
  await send(command);
  if (next === null) {
    window.close();
    return;
  }
  stretch = next;
  closing = false;
  render();
}

$('stretchDone').addEventListener('click', () => window.close());

$('confirm').addEventListener('click', (event) => answer('confirm', event));
$('snooze').addEventListener('click', (event) => answer('snooze', event));
$('stopTimer').addEventListener('click', (event) => answer('stop', event));

// --- Settings ---

for (const [key, input] of Object.entries(minuteInputs)) {
  // Save while typing (the popup may close before "change" fires) ...
  input.addEventListener('input', () => {
    const minutes = Number(input.value);
    if (input.value !== '' && Number.isInteger(minutes) && minutes === clampMinutes(minutes)) {
      saveSettings({ [key]: minutes });
    }
  });
  // ... and tidy up whatever is left in the field afterwards.
  input.addEventListener('change', () => {
    const minutes = clampMinutes(input.value, settings[key]);
    input.value = minutes;
    saveSettings({ [key]: minutes });
  });
}

$('soundEnabled').addEventListener('change', (event) => {
  saveSettings({ soundEnabled: event.target.checked });
});

$('volume').addEventListener('change', (event) => {
  saveSettings({ volume: Number(event.target.value) });
});

$('autoStart').addEventListener('change', (event) => {
  saveSettings({ autoStart: event.target.checked });
});

$('stretchEnabled').addEventListener('change', (event) => {
  saveSettings({ stretchEnabled: event.target.checked });
});

$('testSound').addEventListener('click', () => send('testSound'));

// Back to the default durations (only the two times; sound and auto-start stay).
{
  const label = t('btnResetDurations', [
    String(DEFAULT_SETTINGS.sitMinutes),
    String(DEFAULT_SETTINGS.standMinutes),
  ]);
  $('resetDurations').title = label;
  $('resetDurations').setAttribute('aria-label', label);
}
$('resetDurations').addEventListener('click', () => {
  const { sitMinutes, standMinutes } = DEFAULT_SETTINGS;
  minuteInputs.sitMinutes.value = sitMinutes;
  minuteInputs.standMinutes.value = standMinutes;
  document.activeElement?.blur?.();
  saveSettings({ sitMinutes, standMinutes });
});

// --- Start ---

// The open connection tells the service worker when the popup closes: it disconnects with
// it. Chrome may stop the worker while the popup is still open, so reconnect in that case.
function connect() {
  const port = chrome.runtime.connect({ name: 'popup' });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    setTimeout(connect, 1000);
  });
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') refresh();
});

localizePage();
refresh();
connect();
