// Constants and helpers shared by the service worker and the extension pages.

export const PHASES = ['sit', 'stand'];
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 240;
export const SNOOZE_MINUTES = 5;

export const DEFAULT_SETTINGS = Object.freeze({
  sitMinutes: 45,
  standMinutes: 15,
  soundEnabled: true,
  volume: 0.7,
  autoStart: false,
  stretchEnabled: false,
});

// The stretching exercises; one of them follows each reminder if the user switched them on.
// Each id has its texts in _locales (stretch_<id>_title/_text/_hint) and its animation in popup.css.
export const STRETCHES = ['neck', 'shoulders', 'reach', 'sidebend', 'crossarm', 'calfraise', 'kneehug'];

// status: 'idle' | 'running' | 'paused' | 'waiting'
//   'waiting' = the phase is over and the timer waits until the user confirms the change.
// phase:  the position the user is in right now ('sit' | 'stand').
// prompt: { to, auto, stretch } while a "change your position" reminder is open, otherwise null.
//   stretch = the exercise shown after the reminder (an id from STRETCHES), or null.
export const DEFAULT_STATE = Object.freeze({
  status: 'idle',
  phase: 'sit',
  endTime: null,
  remainingMs: null,
  durationMs: null,
  prompt: null,
  // true while the timer is paused because the screen is locked (it resumes on unlock).
  pausedByLock: false,
  // The exercise picked last, so the next one is a different one.
  lastStretch: null,
});

export const otherPhase = (phase) => (phase === 'sit' ? 'stand' : 'sit');

export const phaseMinutes = (settings, phase) =>
  phase === 'stand' ? settings.standMinutes : settings.sitMinutes;

export function clampMinutes(value, fallback) {
  const minutes = Math.round(Number(value));
  if (value === '' || value == null || !Number.isFinite(minutes)) return fallback;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes));
}

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  return {
    ...merged,
    sitMinutes: clampMinutes(merged.sitMinutes, DEFAULT_SETTINGS.sitMinutes),
    standMinutes: clampMinutes(merged.standMinutes, DEFAULT_SETTINGS.standMinutes),
  };
}

export async function saveSettings(patch) {
  const settings = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}

export async function loadState() {
  const { state } = await chrome.storage.local.get('state');
  return { ...DEFAULT_STATE, ...state };
}

// Minutes shown on the toolbar icon: counts started minutes, so the last minute reads "1".
// The one-second tolerance keeps the number stable when an update fires slightly early.
export function minutesLeft(ms) {
  return Math.max(1, Math.ceil((ms - 1000) / 60_000));
}

export function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// Fills in the texts of a page: data-i18n, data-i18n-title and data-i18n-aria-label.
export function localizePage() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
  for (const el of document.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }
}

// Sends a command to the service worker.
export function send(type, extra) {
  return chrome.runtime.sendMessage({ type, ...extra });
}
