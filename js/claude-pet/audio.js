// Sound starts only after the visitor explicitly enables it. The audio clock is
// suspended with the room; no timers, downloads or autoplay on the blog page.
export class RoomAudio {
  constructor() { this.enabled = false; this.nextNote = 0; this.note = 0; }
  toggle() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      this.context = new Context();
      this.gain = this.context.createGain(); this.gain.gain.value = .12;
      this.gain.connect(this.context.destination);
    }
    this.enabled = !this.enabled;
    this.setActive(this.enabled);
    return this.enabled;
  }
  setActive(active) {
    if (!this.context) return;
    if (active && this.enabled) {
      this.context.resume().catch(() => {});
      this.nextNote = this.context.currentTime + .15;
    } else this.context.suspend().catch(() => {});
  }
  tone(frequency, length = .6, volume = .3) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + .02);
    envelope.gain.exponentialRampToValueAtTime(.001, now + length);
    oscillator.connect(envelope); envelope.connect(this.gain);
    oscillator.start(now); oscillator.stop(now + length + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  update(night) {
    if (!this.enabled || this.context?.state !== 'running' || this.context.currentTime < this.nextNote) return;
    const notes = night ? [261.63, 329.63, 392, 493.88, 392, 329.63] : [293.66, 369.99, 440, 554.37, 440, 369.99, 329.63, 440];
    this.tone(notes[this.note++ % notes.length], 1.7, .12);
    this.nextNote = this.context.currentTime + (night ? .9 : .7);
  }
}
