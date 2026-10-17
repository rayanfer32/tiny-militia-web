// Tiny Militia Web - Authentic Web Audio Sound Manager (TypeScript)

export interface PlayOptions {
  volume?: number;
  detune?: number;
  isVoice?: boolean;
  pan?: number;
}

interface ActiveLoop {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private activeLoops: Map<string, ActiveLoop> = new Map();
  private initialized: boolean = false;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;

  // List of key sound files to preload
  public readonly soundManifest: Record<string, string> = {
    // Weapons
    ak47: '/audio/ak47.wav',
    m16: '/audio/m16.wav',
    deagle: '/audio/deagle.wav',
    magnum: '/audio/magnum.wav',
    shotgun: '/audio/shotgun.wav',
    bolt: '/audio/bolt.wav',
    rocket: '/audio/rocket.wav',
    dryfire: '/audio/dryfire.wav',
    reload: '/audio/reload.wav',

    // Character & Movement
    jet: '/audio/jet.wav',
    boots: '/audio/boots.wav',
    melee: '/audio/melee.wav',
    throw: '/audio/throw.wav',
    pickup: '/audio/pickup.wav',
    ricochet: '/audio/ricochet.wav',
    impact: '/audio/impact.wav',
    explode: '/audio/explode.wav',

    // Voice lines & Callouts
    death1: '/audio/death1.wav',
    death2: '/audio/death2.wav',
    death3: '/audio/death3.wav',
    death4: '/audio/death4.wav',
    death5: '/audio/death5.wav',
    cmonboy: '/audio/cmonboy.wav',
    bringit: '/audio/bringit.wav',
    hoorah: '/audio/hoorah.wav',
    gotme: '/audio/gotme.wav',
    coverme: '/audio/coverme.wav',
    readyup: '/audio/readyup.wav'
  };

  public init(): void {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.masterGain);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 1.0;
      this.voiceGain.connect(this.masterGain);

      this.initialized = true;

      // Start preloading sounds
      this.preloadAll();
    } catch (e) {
      console.warn('AudioContext not allowed or supported yet', e);
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public async loadSound(name: string, url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    if (this.buffers.has(name)) return this.buffers.get(name)!;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(name, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.warn(`Failed to load audio ${name} from ${url}:`, err);
      return null;
    }
  }

  public async preloadAll(): Promise<void> {
    const promises = Object.entries(this.soundManifest).map(([name, url]) =>
      this.loadSound(name, url)
    );
    await Promise.allSettled(promises);
    console.log(`Preloaded ${this.buffers.size} authentic sounds from APK!`);
  }

  public play(name: string, options: PlayOptions = {}): AudioBufferSourceNode | null {
    if (!this.initialized || !this.ctx || !this.sfxGain || !this.voiceGain) return null;
    this.resume();

    const buffer = this.buffers.get(name);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Pitch variation for variety
    const detune = options.detune ?? (Math.random() * 80 - 40);
    source.detune.value = detune;

    const gainNode = this.ctx.createGain();
    const volume = options.volume ?? 1.0;
    gainNode.gain.value = volume;

    // Spatial panning if pos provided relative to listener
    let targetOutput: GainNode = options.isVoice ? this.voiceGain : this.sfxGain;

    if (options.pan !== undefined && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      source.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(targetOutput);
    } else {
      source.connect(gainNode);
      gainNode.connect(targetOutput);
    }

    source.start(0);
    return source;
  }

  public playRandomDeath(pan: number = 0): void {
    const deaths = ['death1', 'death2', 'death3', 'death4', 'death5'];
    const pick = deaths[Math.floor(Math.random() * deaths.length)];
    this.play(pick, { volume: 0.9, isVoice: true, pan });
  }

  public playRandomCallout(pan: number = 0): void {
    const calls = ['cmonboy', 'bringit', 'hoorah', 'gotme', 'coverme'];
    const pick = calls[Math.floor(Math.random() * calls.length)];
    this.play(pick, { volume: 0.85, isVoice: true, pan });
  }

  public startLoop(name: string, id: string = 'default', volume: number = 0.5): void {
    if (!this.initialized || !this.ctx || !this.sfxGain) return;
    this.resume();

    const key = `${name}_${id}`;
    if (this.activeLoops.has(key)) return;

    const buffer = this.buffers.get(name);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.1);

    source.connect(gainNode);
    gainNode.connect(this.sfxGain);

    source.start(0);
    this.activeLoops.set(key, { source, gainNode });
  }

  public stopLoop(name: string, id: string = 'default'): void {
    if (!this.ctx) return;
    const key = `${name}_${id}`;
    const active = this.activeLoops.get(key);
    if (!active) return;

    const { source, gainNode } = active;
    gainNode.gain.setValueAtTime(gainNode.gain.value, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    setTimeout(() => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
      this.activeLoops.delete(key);
    }, 160);
  }
}

export const sounds = new SoundManager();
