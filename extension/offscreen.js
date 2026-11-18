// Plays the reminder chime. A service worker has no audio output, so the worker opens
// this offscreen document for it. The chime is synthesised: no sound files to ship.

const NOTES = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
const NOTE_STEP = 0.17; // seconds between two notes
const NOTE_LENGTH = 1.1; // seconds a note rings out
const REPEAT_GAP = 0.45; // pause before the motif is played a second time

// One bell-like note: the fundamental plus two quieter, shorter overtones.
function strike(context, output, frequency, at) {
  const partials = [
    [1, 0.5, NOTE_LENGTH],
    [2, 0.12, NOTE_LENGTH * 0.5],
    [3, 0.05, NOTE_LENGTH * 0.3],
  ];
  for (const [ratio, level, length] of partials) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.frequency.value = frequency * ratio;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(envelope).connect(output);
    oscillator.start(at);
    oscillator.stop(at + length + 0.05);
  }
}

// 'up' rises (raise the desk), 'down' falls (lower the desk).
async function playChime(tone, volume) {
  const context = new AudioContext();
  try {
    await context.resume();
    const output = context.createGain();
    // Squared so the slider feels even to the ear.
    output.gain.value = Math.min(1, Math.max(0, Number(volume) || 0)) ** 2;
    output.connect(context.destination);

    const notes = tone === 'down' ? [...NOTES].reverse() : NOTES;
    const start = context.currentTime + 0.05;
    const motif = notes.length * NOTE_STEP + REPEAT_GAP;
    for (const offset of [0, motif]) {
      notes.forEach((frequency, i) => strike(context, output, frequency, start + offset + i * NOTE_STEP));
    }
    const seconds = 0.05 + motif + notes.length * NOTE_STEP + NOTE_LENGTH;
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  } finally {
    await context.close();
  }
}

let playing = 0;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen' || message.type !== 'play') return;
  playing += 1;
  playChime(message.tone, message.volume)
    .catch((error) => console.warn(error))
    .finally(() => {
      playing -= 1;
      // Done: close this document again (the worker reopens it for the next chime).
      if (playing === 0) window.close();
    });
  sendResponse({ ok: true });
});
