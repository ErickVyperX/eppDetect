// Servicio de Alerta Sonora Local usando Web Audio API
class SoundService {
  constructor() {
    this.audioCtx = null;
    this.isEnabled = true;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  playIncidentAlert() {
    if (!this.isEnabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      // Generar tono de alarma industrial de doble pitido
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(880, now); // Nota A5
      osc1.frequency.exponentialRampToValueAtTime(440, now + 0.15);

      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);

      osc1.start(now);
      osc1.stop(now + 0.15);

      // Segundo pulso de advertencia
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(988, now + 0.2); // Nota B5
      osc2.frequency.exponentialRampToValueAtTime(520, now + 0.4);

      gain2.gain.setValueAtTime(0.35, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);

      osc2.start(now + 0.2);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn("No se pudo reproducir sonido de alerta:", e);
    }
  }
}

export const soundService = new SoundService();
