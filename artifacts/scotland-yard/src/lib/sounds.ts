// Lightweight Web Audio API sound effects — no external files, all synthesized.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function silent(fn: () => void) {
  try { fn(); } catch { /* audio is non-critical */ }
}

// ── 1. Tab switch (Join / Create tabs) ───────────────────────────────────────
// Short lateral "swoosh" — descending triangle wave
export function playTabSwitch() {
  silent(() => {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(700, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.08);
    gain.gain.setValueAtTime(0.09, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.1);
  });
}

// ── 2. Role select — Detective ────────────────────────────────────────────────
// Two ascending sharp pings — authoritative, bright
export function playDetectiveSelect() {
  silent(() => {
    const c = getCtx();
    [0, 0.06].forEach((offset, i) => {
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(900 + i * 200, c.currentTime + offset);
      gain.gain.setValueAtTime(0.07, c.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.05);
      osc.start(c.currentTime + offset); osc.stop(c.currentTime + offset + 0.05);
    });
  });
}

// ── 3. Role select — Mr. X ────────────────────────────────────────────────────
// Single low, hollow resonance — mysterious, ominous
export function playMrXSelect() {
  silent(() => {
    const c = getCtx();
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.18);
    gain.gain.setValueAtTime(0.13, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.22);
  });
}

// ── 4. Join Game button ────────────────────────────────────────────────────────
// Radio-style double beep — like a field radio confirmation
export function playJoinGame() {
  silent(() => {
    const c = getCtx();
    [0, 0.1].forEach(offset => {
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, c.currentTime + offset);
      gain.gain.setValueAtTime(0.11, c.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.07);
      osc.start(c.currentTime + offset); osc.stop(c.currentTime + offset + 0.07);
    });
  });
}

// ── 5. Create Game button ──────────────────────────────────────────────────────
// Deep resonant thud with short rumble — launching an operation
export function playCreateGame() {
  silent(() => {
    const c = getCtx();
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.2);
    // Subtle high shimmer on top
    const osc2 = c.createOscillator(); const gain2 = c.createGain();
    osc2.connect(gain2); gain2.connect(c.destination);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2400, c.currentTime);
    gain2.gain.setValueAtTime(0.05, c.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
    osc2.start(c.currentTime); osc2.stop(c.currentTime + 0.06);
  });
}

// ── 6. Copy room code ─────────────────────────────────────────────────────────
// Tiny crisp "pop" — like an ink stamp
export function playCopyCode() {
  silent(() => {
    const c = getCtx();
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.015);
    gain.gain.setValueAtTime(0.14, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.025);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.03);
  });
}

// ── 7. Start / Commence Operation ─────────────────────────────────────────────
// Rising three-note chime — dramatic mission launch
export function playStartGame() {
  silent(() => {
    const c = getCtx();
    [
      { t: 0,    freq: 440, vol: 0.10 },
      { t: 0.09, freq: 660, vol: 0.10 },
      { t: 0.18, freq: 880, vol: 0.12 },
    ].forEach(({ t, freq, vol }) => {
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + t);
      gain.gain.setValueAtTime(vol, c.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.12);
      osc.start(c.currentTime + t); osc.stop(c.currentTime + t + 0.13);
    });
  });
}

// ── 8. Leave / Logout ─────────────────────────────────────────────────────────
// Soft downward glide — stepping back
export function playLeave() {
  silent(() => {
    const c = getCtx();
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.14);
    gain.gain.setValueAtTime(0.09, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.16);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.16);
  });
}

// ── 9. Black Card toggle ──────────────────────────────────────────────────────
// Eerie low wobble — dark and mysterious
export function playBlackCard() {
  silent(() => {
    const c = getCtx();
    const osc = c.createOscillator(); const gain = c.createGain();
    // LFO wobble
    const lfo = c.createOscillator(); const lfoGain = c.createGain();
    lfo.frequency.value = 18;
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, c.currentTime);
    gain.gain.setValueAtTime(0.10, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    lfo.start(c.currentTime); lfo.stop(c.currentTime + 0.25);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.25);
  });
}

// ── 10. Double Move toggle ────────────────────────────────────────────────────
// Two rapid ascending blips — like charging up
export function playDoubleMove() {
  silent(() => {
    const c = getCtx();
    [
      { t: 0,    freq: 700 },
      { t: 0.08, freq: 1050 },
    ].forEach(({ t, freq }) => {
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, c.currentTime + t);
      gain.gain.setValueAtTime(0.08, c.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.055);
      osc.start(c.currentTime + t); osc.stop(c.currentTime + t + 0.06);
    });
  });
}

// ── 11. Station tap (map click) ───────────────────────────────────────────────
// Sharp percussive tick — dry, precise, not musical
export function playStationTap() {
  silent(() => {
    const c = getCtx();
    // Noise burst shaped into a tick
    const bufSize = c.sampleRate * 0.03;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = c.createBufferSource();
    src.buffer = buf;
    const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 3000;
    const gain = c.createGain();
    src.connect(hpf); hpf.connect(gain); gain.connect(c.destination);
    gain.gain.setValueAtTime(0.35, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.03);
    src.start(c.currentTime); src.stop(c.currentTime + 0.03);
  });
}

// ── 12. Transport select (modal confirm) ──────────────────────────────────────
// Mechanical lock-in "clunk" — decisive, satisfying
export function playTransportSelect() {
  silent(() => {
    const c = getCtx();
    // Low thump
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.06);
    gain.gain.setValueAtTime(0.16, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.09);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.09);
    // High click on top
    const osc2 = c.createOscillator(); const gain2 = c.createGain();
    osc2.connect(gain2); gain2.connect(c.destination);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2200, c.currentTime);
    gain2.gain.setValueAtTime(0.08, c.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.025);
    osc2.start(c.currentTime); osc2.stop(c.currentTime + 0.03);
  });
}

// ── 13. Return to HQ (game over) ──────────────────────────────────────────────
// Descending three-note outro — wrapping up
export function playReturnHQ() {
  silent(() => {
    const c = getCtx();
    [
      { t: 0,    freq: 660 },
      { t: 0.09, freq: 440 },
      { t: 0.18, freq: 330 },
    ].forEach(({ t, freq }) => {
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + t);
      gain.gain.setValueAtTime(0.10, c.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.13);
      osc.start(c.currentTime + t); osc.stop(c.currentTime + t + 0.14);
    });
  });
}
