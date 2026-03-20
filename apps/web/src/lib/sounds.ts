let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15,
) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playKillSound() {
  playTone(440, 0.15, 'sine', 0.12);
  setTimeout(() => playTone(520, 0.12, 'sine', 0.10), 80);
}

export function playFightSound() {
  playTone(260, 0.3, 'sine', 0.14);
  setTimeout(() => playTone(350, 0.25, 'sine', 0.12), 180);
  setTimeout(() => playTone(260, 0.35, 'sine', 0.10), 380);
}

export function playCampSound() {
  playTone(600, 0.3, 'sawtooth', 0.08);
  setTimeout(() => playTone(500, 0.3, 'sawtooth', 0.08), 200);
}

export function playRoamSound() {
  playTone(380, 0.15, 'square', 0.06);
  setTimeout(() => playTone(480, 0.15, 'square', 0.06), 100);
  setTimeout(() => playTone(380, 0.15, 'square', 0.06), 200);
}

export function playSoundForEvent(eventType: string) {
  switch (eventType) {
    case 'kill.new':
    case 'killmail.pochven':
      playKillSound();
      break;
    case 'fight.started':
    case 'fight.updated':
      playFightSound();
      break;
    case 'camp.detected':
      playCampSound();
      break;
    case 'roam.tracked':
      playRoamSound();
      break;
  }
}
