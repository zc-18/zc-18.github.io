export const TRACKS = [
  { id: 'day', title: 'Dreamer', file: 'dreamer.m4a', isrc: 'USUAN1600043' },
  { id: 'night', title: 'Dream Culture', file: 'dream-culture.m4a', isrc: 'USUAN1300046' }
];

// No media, context, request or autoplay before an explicit gesture. Music
// streams locally; short UI sounds share the same user-controlled gain.
export class RoomAudio {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.enabled = false;
    this.active = false;
    this.playing = false;
    this.status = 'off';
    this.volume = .35;
    this.selection = 'auto';
    this.channels = new Map();
    this.revision = 0;
    try {
      const saved = JSON.parse(localStorage.getItem('cl-pet-audio-v1'));
      if (Number.isFinite(saved?.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
      if (['auto', 'day', 'night'].includes(saved?.selection)) this.selection = saved.selection;
    } catch (_) { /* Playback does not depend on storage. */ }
  }

  notify() { this.onChange(this); }
  save() {
    try { localStorage.setItem('cl-pet-audio-v1', JSON.stringify({ volume: this.volume, selection: this.selection })); } catch (_) { /* Optional preferences. */ }
  }

  init() {
    if (this.context) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('Audio unavailable');
    this.context = new Context();
    this.gain = this.context.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.context.destination);
  }

  setEnabled(enabled) {
    if (enabled) {
      try { this.init(); } catch (_) { this.status = 'error'; this.notify(); return false; }
    }
    this.enabled = enabled;
    this.reconcile();
    return this.enabled;
  }

  toggle() { return this.setEnabled(!this.enabled); }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.reconcile();
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    if (this.context) this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, .06);
    this.save(); this.notify();
  }

  select(value) {
    if (!['auto', 'day', 'night'].includes(value)) return;
    this.selection = value;
    this.save(); this.reconcile();
  }

  channel(id) {
    if (this.channels.has(id)) return this.channels.get(id);
    const track = TRACKS.find(track => track.id === id);
    const media = new Audio();
    media.preload = 'none'; media.loop = true;
    media.src = '/audio/pet-room/' + track.file;
    const source = this.context.createMediaElementSource(media), gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(gain); gain.connect(this.gain);
    const channel = { media, gain, track };
    media.addEventListener('error', () => { if (this.current === channel && this.enabled) this.fail(); });
    media.addEventListener('waiting', () => {
      if (this.current === channel && this.enabled && this.active) { this.status = 'loading'; this.playing = false; this.notify(); }
    });
    media.addEventListener('playing', () => {
      if (this.current === channel && this.enabled && this.active) { this.status = 'playing'; this.playing = true; this.notify(); }
    });
    this.channels.set(id, channel);
    return channel;
  }

  fail() {
    this.enabled = false;
    this.reconcile();
    this.status = 'error'; this.notify();
  }

  reconcile() {
    const revision = ++this.revision;
    if (!this.enabled || !this.active) {
      for (const channel of this.channels.values()) { channel.media.pause(); channel.stopAt = 0; }
      this.context?.suspend().catch(() => {});
      this.playing = false;
      this.status = this.enabled ? 'paused' : 'off';
      this.notify();
      return;
    }
    const id = this.selection === 'auto' ? (this.night ? 'night' : 'day') : this.selection;
    const next = this.channel(id);
    if (next.media.error) next.media.load();
    this.current = next;
    this.status = 'loading'; this.notify();
    // Both start inside the activating gesture, including on iOS.
    const resume = this.context.resume(), play = next.media.play();
    Promise.all([resume, play]).then(() => {
      if (revision !== this.revision || !this.active || !this.enabled) return;
      const now = this.context.currentTime;
      for (const channel of this.channels.values()) {
        channel.gain.gain.cancelScheduledValues(now);
        channel.gain.gain.setTargetAtTime(channel === next ? 1 : 0, now, .35);
        channel.stopAt = channel === next ? 0 : now + 2;
      }
      this.status = 'playing'; this.playing = true; this.notify();
    }).catch(() => {
      if (revision === this.revision) this.fail();
    });
  }

  tone(frequency, length = .6, volume = .3) {
    if (!this.enabled || !this.active || this.context?.state !== 'running') return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume * .12, now + .02);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + length);
    oscillator.connect(envelope); envelope.connect(this.gain);
    oscillator.start(now); oscillator.stop(now + length + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  update(night) {
    if (this.night !== night) {
      this.night = night;
      if (this.enabled && this.active && this.selection === 'auto') this.reconcile();
    }
    if (this.context?.state !== 'running') return;
    for (const channel of this.channels.values()) if (channel.stopAt && this.context.currentTime >= channel.stopAt) {
      channel.media.pause(); channel.stopAt = 0;
    }
  }
}
