/** Web Audio SFX — no bundled audio files, synthesized inline. */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Whooshy page-turn: two filtered noise bursts */
export function sfxPageTurn() {
  try {
    const c = getCtx();
    const buf = c.createBuffer(1, c.sampleRate * 0.18, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);

    const src = c.createBufferSource();
    src.buffer = buf;

    const bpf = c.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(3200, c.currentTime);
    bpf.frequency.linearRampToValueAtTime(800, c.currentTime + 0.18);
    bpf.Q.value = 0.6;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.35, c.currentTime);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.18);

    src.connect(bpf).connect(gain).connect(c.destination);
    src.start();
  } catch { /* AudioContext blocked */ }
}

/** Sparkle chime: rising sine glide */
export function sfxSparkle() {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(3520, c.currentTime + 0.25);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);

    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.3);
  } catch { /* blocked */ }
}

/** Story-end chime: three descending tones */
export function sfxStoryEnd() {
  try {
    const c = getCtx();
    const freqs = [880, 660, 440];
    freqs.forEach((f, i) => {
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;

      const gain = c.createGain();
      const t0 = c.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.05);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.55);

      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    });
  } catch { /* blocked */ }
}

/** Short success pop when Art Director finishes */
export function sfxSuccess() {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.08);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.25, c.currentTime);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.15);

    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.15);
  } catch { /* blocked */ }
}
