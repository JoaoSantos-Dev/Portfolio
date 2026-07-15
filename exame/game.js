(() => {
  "use strict";

  // Preencha apenas os caminhos que existirem. Sem arquivos, o jogo usa sons sintetizados.
  const OPTIONAL_AUDIO_FILES = {
    ambient: "",
    crowd: "",
    applause: "",
    step: "",
    celebration: "",
    firework: "",
  };

  const CHEERS = [
    "Herói!",
    "Parabéns!",
    "Grande trabalho!",
    "Você conseguiu!",
    "Lenda!",
    "Campeão!",
    "Que orgulho!",
    "Você merece!",
    "Missão cumprida!",
    "Mandou muito bem!",
    "A vila celebra!",
    "Sensacional!",
    "Brilhou demais!",
    "Dia histórico!",
    "Vitória merecida!",
    "Nunca duvidamos!",
    "Que conquista!",
    "Esse é nosso herói!",
  ];

  const CROWD_COLORS = ["#496f78", "#9b4e3d", "#657d45", "#715576", "#b36b32", "#3f5d73"];
  const PARTICLE_COLORS = ["#e57b2c", "#dfb13f", "#648d45", "#b94d32", "#f0d279"];
  const FIREWORK_COLORS = ["#ffd45f", "#ff7547", "#7be0c3", "#f18fc7", "#8bc8ff"];
  const TAU = Math.PI * 2;

  const modal = document.querySelector("#ceremony-game");
  const canvas = document.querySelector("#game-canvas");

  if (!modal || !canvas) return;

  const context = canvas.getContext("2d", { alpha: false });
  const ui = {
    place: document.querySelector("#game-player-place"),
    name: document.querySelector("#game-player-name"),
    score: document.querySelector("#game-player-score"),
    title: document.querySelector("#game-player-title"),
    close: document.querySelector("#game-close"),
    sound: document.querySelector("#game-sound"),
    announcement: document.querySelector("#game-announcement"),
  };

  const layout = {
    width: 0,
    height: 0,
    dpr: 1,
    topY: 0,
    bottomY: 0,
    centerX: 0,
    topHalf: 0,
    bottomHalf: 0,
    portraitWidth: 0,
    portraitHeight: 0,
    portraitTop: 0,
    walkableTop: 0,
  };

  const state = {
    active: false,
    selected: null,
    photoSlot: 1,
    animationId: 0,
    lastTime: 0,
    elapsed: 0,
    returnScroll: 0,
    returnFocus: null,
    moving: false,
    wasMoving: false,
    nextBubbleAt: 0,
    ambientParticleTimer: 0,
    reactionParticleTimer: 0,
    lastFootstep: -1,
    resizeFrame: 0,
    announcementTimer: 0,
  };

  const character = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    directionX: 0,
    directionY: -1,
    walkCycle: 0,
    speed: 172,
  };

  const destinationMarker = { active: false, x: 0, y: 0, age: 0 };
  const crowd = [];
  const championPhotos = new Map();
  const particles = Array.from({ length: 150 }, () => ({
    active: false,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    life: 0,
    maxLife: 0,
    size: 0,
    rotation: 0,
    rotationSpeed: 0,
    color: "#fff",
    kind: 0,
    growth: 0,
    trailTimer: 0,
  }));

  const scenePaint = {
    sky: null,
    ground: null,
    corridor: null,
    light: null,
    vignette: null,
  };

  const FRAME_THEMES = {
    1: { metal: "#f2bd45", light: "#ffe99c", dark: "#8b4f1e", ribbon: "#a63f2d" },
    2: { metal: "#c8d0cf", light: "#f3f4e9", dark: "#596868", ribbon: "#466b78" },
    3: { metal: "#c47a48", light: "#f2c090", dark: "#70432c", ribbon: "#7a4931" },
  };

  const PHOTO_FOCUS = {
    1: { x: 0.5, y: 0.38, zoom: 1.45 },
    2: { x: 0.5, y: 0.38, zoom: 1.3 },
    3: { x: 0.5, y: 0.43, zoom: 1 },
  };

  function loadChampionPhoto(slot) {
    if (championPhotos.has(slot)) return championPhotos.get(slot);

    const entry = { image: new Image(), loaded: false, failed: false };
    entry.image.decoding = "async";
    entry.image.addEventListener("load", () => {
      entry.loaded = true;
    });
    entry.image.addEventListener("error", () => {
      entry.failed = true;
    });
    entry.image.src = `IMG/${slot}.png`;
    championPhotos.set(slot, entry);
    return entry;
  }

  class AudioController {
    constructor() {
      this.enabled = false;
      this.hasUserChoice = false;
      this.audioContext = null;
      this.master = null;
      this.ambientSource = null;
      this.ambientOscillator = null;
      this.ambientGain = null;
      this.ambientFilter = null;
      this.ambientLfo = null;
      this.ambientLfoGain = null;
      this.noiseBuffer = null;
      this.crowdNoiseBuffer = null;
      this.files = {};

      Object.entries(OPTIONAL_AUDIO_FILES).forEach(([name, source]) => {
        if (!source) return;
        const audio = new Audio(source);
        audio.preload = "auto";
        audio.loop = name === "ambient" || name === "crowd";
        audio.addEventListener("error", () => {
          this.files[name] = null;
        });
        this.files[name] = audio;
      });
    }

    ensureContext() {
      if (this.audioContext) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      this.master = this.audioContext.createGain();
      this.master.gain.value = 0.38;
      this.master.connect(this.audioContext.destination);

      this.noiseBuffer = this.audioContext.createBuffer(1, Math.floor(this.audioContext.sampleRate * 0.12), this.audioContext.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = Math.random() * 2 - 1;
      }

      this.crowdNoiseBuffer = this.audioContext.createBuffer(1, Math.floor(this.audioContext.sampleRate * 2.5), this.audioContext.sampleRate);
      const crowdSamples = this.crowdNoiseBuffer.getChannelData(0);
      let smoothedNoise = 0;
      for (let index = 0; index < crowdSamples.length; index += 1) {
        smoothedNoise = smoothedNoise * 0.94 + (Math.random() * 2 - 1) * 0.06;
        const murmur = 0.72 + Math.sin((index / this.audioContext.sampleRate) * TAU * 2.1) * 0.14;
        crowdSamples[index] = smoothedNoise * murmur;
      }
    }

    async toggle() {
      this.hasUserChoice = true;
      this.enabled = !this.enabled;
      if (this.enabled) {
        this.ensureContext();
        if (this.audioContext?.state === "suspended") await this.audioContext.resume();
        this.startAmbient();
      } else {
        this.stopAmbient();
      }
      return this.enabled;
    }

    enableByDefault() {
      if (this.hasUserChoice || this.enabled) return;
      this.enabled = true;
      this.ensureContext();
      if (this.audioContext?.state === "suspended") {
        this.audioContext.resume().then(() => this.startAmbient()).catch(() => {});
      } else {
        this.startAmbient();
      }
    }

    playFile(name) {
      const audio = this.files[name];
      if (!this.enabled || !audio) return false;
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return true;
    }

    startAmbient() {
      if (!this.enabled) return;
      const ambientFile = this.files.crowd || this.files.ambient;
      if (ambientFile) {
        ambientFile.volume = 0.28;
        ambientFile.play().catch(() => {});
        return;
      }
      if (!this.audioContext || this.ambientSource || !this.crowdNoiseBuffer) return;

      this.ambientSource = this.audioContext.createBufferSource();
      this.ambientOscillator = this.audioContext.createOscillator();
      this.ambientGain = this.audioContext.createGain();
      this.ambientFilter = this.audioContext.createBiquadFilter();
      this.ambientLfo = this.audioContext.createOscillator();
      this.ambientLfoGain = this.audioContext.createGain();

      this.ambientSource.buffer = this.crowdNoiseBuffer;
      this.ambientSource.loop = true;
      this.ambientFilter.type = "bandpass";
      this.ambientFilter.frequency.value = 620;
      this.ambientFilter.Q.value = 0.7;
      this.ambientGain.gain.value = 0.12;
      this.ambientLfo.type = "sine";
      this.ambientLfo.frequency.value = 0.38;
      this.ambientLfoGain.gain.value = 0.035;

      this.ambientSource.connect(this.ambientFilter);
      this.ambientFilter.connect(this.ambientGain);
      this.ambientLfo.connect(this.ambientLfoGain);
      this.ambientLfoGain.connect(this.ambientGain.gain);
      this.ambientOscillator.type = "sine";
      this.ambientOscillator.frequency.value = 118;
      const voiceGain = this.audioContext.createGain();
      voiceGain.gain.value = 0.007;
      this.ambientOscillator.connect(voiceGain);
      voiceGain.connect(this.ambientGain);
      this.ambientGain.connect(this.master);
      this.ambientSource.start();
      this.ambientOscillator.start();
      this.ambientLfo.start();
    }

    stopAmbient() {
      [this.files.crowd, this.files.ambient].forEach((audioFile) => {
        if (!audioFile) return;
        audioFile.pause();
        audioFile.currentTime = 0;
      });
      if (this.ambientSource) {
        this.ambientSource.stop();
        this.ambientSource.disconnect();
        this.ambientSource = null;
      }
      if (this.ambientOscillator) {
        this.ambientOscillator.stop();
        this.ambientOscillator.disconnect();
        this.ambientOscillator = null;
      }
      if (this.ambientLfo) {
        this.ambientLfo.stop();
        this.ambientLfo.disconnect();
        this.ambientLfo = null;
      }
      this.ambientLfoGain?.disconnect();
      this.ambientFilter?.disconnect();
      this.ambientGain?.disconnect();
      this.ambientLfoGain = null;
      this.ambientFilter = null;
      this.ambientGain = null;
    }

    step() {
      if (!this.enabled || this.playFile("step") || !this.audioContext) return;
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      const now = this.audioContext.currentTime;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(105, now);
      oscillator.frequency.exponentialRampToValueAtTime(62, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
    }

    applause(intensity = 1) {
      if (!this.enabled || this.playFile("applause") || !this.audioContext || !this.noiseBuffer) return;
      const source = this.audioContext.createBufferSource();
      const filter = this.audioContext.createBiquadFilter();
      const gain = this.audioContext.createGain();
      const now = this.audioContext.currentTime;
      source.buffer = this.noiseBuffer;
      filter.type = "bandpass";
      filter.frequency.value = 950 + Math.random() * 500;
      gain.gain.setValueAtTime(0.04 * intensity, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
    }

    celebration() {
      if (!this.enabled || this.playFile("celebration") || !this.audioContext) return;
      const now = this.audioContext.currentTime;
      [0, 0.08, 0.16].forEach((offset, index) => {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = [392, 523, 659][index];
        gain.gain.setValueAtTime(0.06, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.23);
        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.24);
      });
    }

    firework() {
      if (!this.enabled || this.playFile("firework") || !this.audioContext || !this.noiseBuffer) return;
      const now = this.audioContext.currentTime;

      [0, 0.14].forEach((delay, index) => {
        const launch = this.audioContext.createOscillator();
        const launchGain = this.audioContext.createGain();
        launch.type = "sawtooth";
        launch.frequency.setValueAtTime(150 + index * 35, now + delay);
        launch.frequency.exponentialRampToValueAtTime(920, now + delay + 0.46);
        launchGain.gain.setValueAtTime(0.055, now + delay);
        launchGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.48);
        launch.connect(launchGain);
        launchGain.connect(this.master);
        launch.start(now + delay);
        launch.stop(now + delay + 0.5);

        const explosion = this.audioContext.createBufferSource();
        const explosionFilter = this.audioContext.createBiquadFilter();
        const explosionGain = this.audioContext.createGain();
        const explosionTime = now + delay + 0.5;
        explosion.buffer = this.noiseBuffer;
        explosionFilter.type = "lowpass";
        explosionFilter.frequency.setValueAtTime(1700, explosionTime);
        explosionFilter.frequency.exponentialRampToValueAtTime(220, explosionTime + 0.2);
        explosionGain.gain.setValueAtTime(0.24, explosionTime);
        explosionGain.gain.exponentialRampToValueAtTime(0.001, explosionTime + 0.26);
        explosion.connect(explosionFilter);
        explosionFilter.connect(explosionGain);
        explosionGain.connect(this.master);
        explosion.start(explosionTime);
      });
    }

    stop() {
      this.stopAmbient();
    }
  }

  const audio = new AudioController();

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function mix(start, end, amount) {
    return start + (end - start) * amount;
  }

  function perspectiveAt(y) {
    return clamp((y - layout.topY) / (layout.bottomY - layout.topY), 0, 1);
  }

  function corridorHalfWidth(y) {
    return mix(layout.topHalf, layout.bottomHalf, perspectiveAt(y));
  }

  function corridorLeft(y) {
    return layout.centerX - corridorHalfWidth(y);
  }

  function corridorRight(y) {
    return layout.centerX + corridorHalfWidth(y);
  }

  function characterScale(y) {
    return 0.68 + perspectiveAt(y) * 0.5;
  }

  function roundedRectangle(x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }

  function rebuildPaint() {
    scenePaint.sky = context.createLinearGradient(0, 0, 0, layout.height);
    scenePaint.sky.addColorStop(0, "#477e86");
    scenePaint.sky.addColorStop(0.44, "#8db9a4");
    scenePaint.sky.addColorStop(1, "#e0a65a");

    scenePaint.ground = context.createLinearGradient(0, layout.topY, 0, layout.bottomY);
    scenePaint.ground.addColorStop(0, "#43583a");
    scenePaint.ground.addColorStop(1, "#263c2e");

    scenePaint.corridor = context.createLinearGradient(0, layout.topY, 0, layout.bottomY);
    scenePaint.corridor.addColorStop(0, "#b58a59");
    scenePaint.corridor.addColorStop(0.55, "#c9a36d");
    scenePaint.corridor.addColorStop(1, "#a97948");

    scenePaint.light = context.createRadialGradient(
      layout.centerX,
      layout.topY + 40,
      20,
      layout.centerX,
      layout.height * 0.5,
      layout.width * 0.6,
    );
    scenePaint.light.addColorStop(0, "rgba(255, 221, 133, 0.2)");
    scenePaint.light.addColorStop(1, "rgba(255, 173, 77, 0)");

    scenePaint.vignette = context.createRadialGradient(
      layout.centerX,
      layout.height * 0.52,
      layout.width * 0.18,
      layout.centerX,
      layout.height * 0.52,
      layout.width * 0.72,
    );
    scenePaint.vignette.addColorStop(0, "rgba(20, 18, 14, 0)");
    scenePaint.vignette.addColorStop(1, "rgba(20, 18, 14, 0.35)");
  }

  function createCrowd() {
    crowd.length = 0;
    const usableHeight = layout.bottomY - layout.topY;
    const countPerSide = clamp(Math.floor(usableHeight / 66), 7, 12);

    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const side = sideIndex === 0 ? -1 : 1;
      for (let index = 0; index < countPerSide; index += 1) {
        const amount = (index + 0.6) / countPerSide;
        crowd.push({
          side,
          y: mix(layout.topY + 38, layout.bottomY - 35, amount),
          offset: 18 + (index % 2) * Math.min(27, layout.width * 0.035),
          phase: Math.random() * TAU,
          color: CROWD_COLORS[(index + sideIndex * 2) % CROWD_COLORS.length],
          intensity: 0.2 + Math.random() * 0.15,
          bubbleText: "",
          bubbleUntil: 0,
          nextSpeechAt: Math.random() * 0.8,
        });
      }
    }
  }

  function resizeGame() {
    if (!state.active) return;

    const oldTop = layout.topY;
    const oldBottom = layout.bottomY;
    const oldCenter = layout.centerX;
    const oldHalf = oldBottom > oldTop ? corridorHalfWidth(character.y) : 1;
    const oldYAmount = oldBottom > oldTop ? perspectiveAt(character.y) : 0.82;
    const oldLateral = oldHalf ? (character.x - oldCenter) / oldHalf : 0;

    const bounds = canvas.getBoundingClientRect();
    layout.width = Math.max(320, Math.round(bounds.width));
    layout.height = Math.max(480, Math.round(bounds.height));
    layout.dpr = Math.min(window.devicePixelRatio || 1, 2);
    layout.centerX = layout.width / 2;
    layout.topY = Math.max(layout.height * 0.19, layout.width < 720 ? 175 : 125);
    layout.bottomY = layout.height - 18;
    layout.topHalf = Math.max(68, layout.width * 0.145);
    layout.bottomHalf = Math.min(layout.width * 0.265, layout.centerX - 42);
    layout.portraitWidth = clamp(layout.topHalf * 0.7, 76, 138);
    layout.portraitHeight = layout.portraitWidth * 1.34;
    layout.portraitTop = layout.topY + 13;
    layout.walkableTop = Math.min(layout.bottomY - 130, layout.portraitTop + layout.portraitHeight + 24);

    canvas.width = Math.round(layout.width * layout.dpr);
    canvas.height = Math.round(layout.height * layout.dpr);
    context.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    rebuildPaint();

    if (oldBottom > oldTop) {
      character.y = mix(layout.topY, layout.bottomY, oldYAmount);
      character.x = layout.centerX + corridorHalfWidth(character.y) * oldLateral;
      clampCharacter();
      character.targetX = character.x;
      character.targetY = character.y;
    } else {
      resetCharacter();
    }

    createCrowd();
  }

  function resetCharacter() {
    character.x = layout.centerX;
    character.y = layout.bottomY - Math.min(90, layout.height * 0.1);
    character.targetX = character.x;
    character.targetY = character.y;
    character.directionX = 0;
    character.directionY = -1;
    character.walkCycle = 0;
    state.lastFootstep = -1;
    state.moving = false;
    state.wasMoving = false;
    destinationMarker.active = false;
  }

  function clampCharacter() {
    character.y = clamp(character.y, layout.walkableTop, layout.bottomY - 26);
    const padding = 19 * characterScale(character.y);
    character.x = clamp(character.x, corridorLeft(character.y) + padding, corridorRight(character.y) - padding);
  }

  function setDestination(x, y) {
    const validY = clamp(y, layout.walkableTop, layout.bottomY - 28);
    const padding = 20 * characterScale(validY);
    const validX = clamp(x, corridorLeft(validY) + padding, corridorRight(validY) - padding);
    character.targetX = validX;
    character.targetY = validY;
    destinationMarker.active = true;
    destinationMarker.x = validX;
    destinationMarker.y = validY;
    destinationMarker.age = 0;
  }

  function spawnParticle(x, y, burst = false) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (particle.active) continue;

      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.velocityX = (Math.random() - 0.5) * (burst ? 155 : 45);
      particle.velocityY = (burst ? -70 - Math.random() * 90 : 20 + Math.random() * 40);
      particle.maxLife = burst ? 1.3 + Math.random() * 0.9 : 2.6 + Math.random() * 2;
      particle.life = particle.maxLife;
      particle.size = 3 + Math.random() * 5;
      particle.rotation = Math.random() * TAU;
      particle.rotationSpeed = (Math.random() - 0.5) * 7;
      particle.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      particle.kind = Math.random() > 0.36 ? 0 : 1;
      particle.growth = 0;
      particle.trailTimer = 0;
      return;
    }
  }

  function spawnDust(x, y) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (particle.active) continue;
      particle.active = true;
      particle.x = x + (Math.random() - 0.5) * 10;
      particle.y = y + (Math.random() - 0.5) * 3;
      particle.velocityX = (Math.random() - 0.5) * 20;
      particle.velocityY = -5 - Math.random() * 9;
      particle.maxLife = 0.45 + Math.random() * 0.25;
      particle.life = particle.maxLife;
      particle.size = 2.5 + Math.random() * 2.5;
      particle.rotation = 0;
      particle.rotationSpeed = 0;
      particle.color = "#e0bd83";
      particle.kind = 2;
      particle.growth = 12 + Math.random() * 9;
      particle.trailTimer = 0;
      return;
    }
  }

  function spawnFireworkSpark(x, y, color, angle, speed, shortLife = false) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (particle.active) continue;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.velocityX = Math.cos(angle) * speed;
      particle.velocityY = Math.sin(angle) * speed;
      particle.maxLife = shortLife ? 0.22 + Math.random() * 0.12 : 0.75 + Math.random() * 0.45;
      particle.life = particle.maxLife;
      particle.size = shortLife ? 1.5 + Math.random() * 1.4 : 2 + Math.random() * 2.2;
      particle.rotation = angle;
      particle.rotationSpeed = 0;
      particle.color = color;
      particle.kind = 4;
      particle.growth = 0;
      particle.trailTimer = 0;
      return;
    }
  }

  function explodeFirework(x, y, color) {
    const sparkCount = layout.width < 620 ? 17 : 23;
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = (index / sparkCount) * TAU + Math.random() * 0.13;
      const speed = 55 + Math.random() * 105;
      spawnFireworkSpark(x, y, color, angle, speed);
    }
    for (let index = 0; index < 8; index += 1) {
      spawnParticle(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 18, true);
    }
  }

  function spawnFireworkRocket(side) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (particle.active) continue;
      particle.active = true;
      particle.x = character.x + side * 22;
      particle.y = character.y - 16;
      particle.velocityX = side * (22 + Math.random() * 18);
      particle.velocityY = -135 - Math.random() * 35;
      particle.maxLife = 0.58 + Math.random() * 0.14;
      particle.life = particle.maxLife;
      particle.size = 3.4;
      particle.rotation = 0;
      particle.rotationSpeed = 0;
      particle.color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
      particle.kind = 3;
      particle.growth = 0;
      particle.trailTimer = 0;
      return;
    }
  }

  function celebrationBurst(withFireworks = true) {
    const strength = state.selected?.position === 1 ? 28 : 19;
    for (let index = 0; index < strength; index += 1) {
      spawnParticle(character.x + (Math.random() - 0.5) * 80, character.y - 10, true);
    }
    audio.celebration();
    if (withFireworks) {
      spawnFireworkRocket(-1);
      spawnFireworkRocket(1);
      audio.firework();
    }
  }

  function updateCharacter(deltaTime) {
    const differenceX = character.targetX - character.x;
    const differenceY = character.targetY - character.y;
    const distance = Math.hypot(differenceX, differenceY);
    state.wasMoving = state.moving;
    state.moving = distance > 2.5;

    if (state.moving) {
      character.directionX = differenceX / distance;
      character.directionY = differenceY / distance;
      const step = Math.min(distance, character.speed * deltaTime);
      character.x += character.directionX * step;
      character.y += character.directionY * step;
      character.walkCycle += deltaTime * 10.5;
      clampCharacter();

      const footstep = Math.floor(character.walkCycle / Math.PI);
      if (footstep !== state.lastFootstep) {
        state.lastFootstep = footstep;
        const footSide = footstep % 2 === 0 ? -1 : 1;
        const scale = characterScale(character.y);
        spawnDust(character.x + footSide * 7 * scale, character.y + 22 * scale);
        audio.step();
      }
    } else if (state.wasMoving) {
      character.x = character.targetX;
      character.y = character.targetY;
      destinationMarker.active = false;
      celebrationBurst();
    }
  }

  function chooseCheerMessage() {
    const firstName = state.selected?.name?.trim().split(/\s+/)[0] || "Herói";
    const choice = Math.random();
    if (choice < 0.16) return `${firstName}!`;
    if (choice < 0.28) return `Vai, ${firstName}!`;
    if (choice < 0.38) return `A festa é sua, ${firstName}!`;
    return CHEERS[Math.floor(Math.random() * CHEERS.length)];
  }

  function updateCrowd(deltaTime) {
    const now = state.elapsed;
    const leaderBoost = state.selected?.position === 1 ? 1.28 : 1;
    let closestDistance = Infinity;
    let activeBubbles = 0;
    let speechCandidate = null;
    let candidateCount = 0;

    for (let index = 0; index < crowd.length; index += 1) {
      const person = crowd[index];
      const x = person.side < 0 ? corridorLeft(person.y) - person.offset : corridorRight(person.y) + person.offset;
      const distance = Math.hypot(character.x - x, character.y - person.y);
      const targetIntensity = distance < 185 ? leaderBoost : 0.28;
      person.intensity += (targetIntensity - person.intensity) * Math.min(1, deltaTime * 5);

      if (person.bubbleUntil > now) {
        activeBubbles += 1;
      } else if (
        distance < Math.max(300, corridorHalfWidth(person.y) + 115) &&
        now >= person.nextSpeechAt &&
        now >= state.nextBubbleAt
      ) {
        candidateCount += 1;
        if (Math.random() < 1 / candidateCount) speechCandidate = person;
      }
      if (distance < closestDistance) {
        closestDistance = distance;
      }
    }

    const bubbleLimit = layout.width < 620 ? 3 : 4;
    if (speechCandidate && activeBubbles < bubbleLimit && now >= state.nextBubbleAt) {
      speechCandidate.bubbleText = chooseCheerMessage();
      speechCandidate.bubbleUntil = now + 2.1 + Math.random() * 0.45;
      speechCandidate.nextSpeechAt = now + 3.5 + Math.random() * 2.5;
      state.nextBubbleAt = now + 0.48 + Math.random() * 0.5;
      audio.applause(leaderBoost);
    }

    state.reactionParticleTimer -= deltaTime;
    if (closestDistance < 170 && state.reactionParticleTimer <= 0) {
      spawnParticle(character.x + (Math.random() - 0.5) * 110, character.y - 25, true);
      state.reactionParticleTimer = state.selected?.position === 1 ? 0.12 : 0.2;
    }
  }

  function updateParticles(deltaTime) {
    state.ambientParticleTimer -= deltaTime;
    if (state.ambientParticleTimer <= 0) {
      spawnParticle(Math.random() * layout.width, layout.topY - 25, false);
      state.ambientParticleTimer = 0.3;
    }

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) continue;
      particle.life -= deltaTime;

      if (particle.kind === 3) {
        particle.x += particle.velocityX * deltaTime;
        particle.y += particle.velocityY * deltaTime;
        particle.velocityY += 24 * deltaTime;
        particle.trailTimer -= deltaTime;
        if (particle.trailTimer <= 0) {
          spawnFireworkSpark(
            particle.x,
            particle.y + 5,
            particle.color,
            Math.PI / 2 + (Math.random() - 0.5) * 0.5,
            20 + Math.random() * 18,
            true,
          );
          particle.trailTimer = 0.035;
        }
        if (particle.life <= 0 || particle.y < 42) {
          const explosionX = particle.x;
          const explosionY = Math.max(45, particle.y);
          const explosionColor = particle.color;
          particle.active = false;
          explodeFirework(explosionX, explosionY, explosionColor);
        }
        continue;
      }

      if (particle.life <= 0 || particle.y > layout.height + 30) {
        particle.active = false;
        continue;
      }
      particle.x += particle.velocityX * deltaTime;
      particle.y += particle.velocityY * deltaTime;
      particle.velocityY += (particle.kind === 0 ? 16 : particle.kind === 1 ? 65 : particle.kind === 2 ? -2 : 45) * deltaTime;
      if (particle.kind < 3) particle.velocityX += Math.sin(state.elapsed * 2.3 + index) * 4 * deltaTime;
      particle.rotation += particle.rotationSpeed * deltaTime;
      particle.size = Math.max(0.4, particle.size + particle.growth * deltaTime);
    }

    if (destinationMarker.active) destinationMarker.age += deltaTime;
  }

  function update(deltaTime) {
    state.elapsed += deltaTime;
    updateCharacter(deltaTime);
    updateCrowd(deltaTime);
    updateParticles(deltaTime);
  }

  function drawHouse(x, y, width, height, color, roofColor) {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
    context.fillStyle = roofColor;
    context.beginPath();
    context.moveTo(x - 8, y);
    context.lineTo(x + width / 2, y - height * 0.38);
    context.lineTo(x + width + 8, y);
    context.closePath();
    context.fill();
    context.fillStyle = "rgba(255, 206, 102, 0.65)";
    context.fillRect(x + width * 0.2, y + height * 0.36, width * 0.18, height * 0.24);
    context.fillRect(x + width * 0.62, y + height * 0.36, width * 0.18, height * 0.24);
  }

  function drawBanner(x, y, side, scale) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.strokeStyle = "#3a261b";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, 24);
    context.lineTo(0, -27);
    context.stroke();
    context.fillStyle = side < 0 ? "#a74331" : "#d7822f";
    context.beginPath();
    context.moveTo(0, -24);
    context.lineTo(side * 24, -20);
    context.lineTo(side * 20, 2 + Math.sin(state.elapsed * 2 + y) * 2);
    context.lineTo(0, -2);
    context.closePath();
    context.fill();
    context.fillStyle = "rgba(255, 224, 144, 0.85)";
    context.beginPath();
    context.arc(side * 11, -11, 4, 0, TAU);
    context.fill();
    context.restore();
  }

  function drawCeremonyGate() {
    const left = layout.centerX - layout.topHalf - 13;
    const right = layout.centerX + layout.topHalf + 13;
    const top = layout.topY - 45;
    const bottom = layout.topY + 25;

    context.fillStyle = "rgba(26, 20, 16, 0.24)";
    context.fillRect(left + 5, top + 6, right - left, 12);
    context.fillStyle = "#53301f";
    context.fillRect(left, top, 13, bottom - top);
    context.fillRect(right - 13, top, 13, bottom - top);
    context.fillStyle = "#7d4525";
    context.fillRect(left - 9, top, right - left + 18, 12);
    context.fillStyle = "#3c251a";
    context.fillRect(left - 14, top - 6, right - left + 28, 7);

    context.fillStyle = "#a44430";
    roundedRectangle(layout.centerX - 28, top + 4, 56, 27, 3);
    context.fill();
    context.save();
    context.translate(layout.centerX, top + 17);
    context.rotate(Math.PI / 4);
    context.strokeStyle = "#f2bc50";
    context.lineWidth = 2;
    context.strokeRect(-6, -6, 12, 12);
    context.restore();
  }

  function drawImageCover(image, x, y, width, height, slot) {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;
    const focus = PHOTO_FOCUS[slot] || PHOTO_FOCUS[1];
    let sourceX = 0;
    let sourceY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceRatio > targetRatio) {
      cropWidth = sourceHeight * targetRatio;
    } else {
      cropHeight = sourceWidth / targetRatio;
    }

    cropWidth /= focus.zoom;
    cropHeight /= focus.zoom;
    sourceX = clamp(sourceWidth * focus.x - cropWidth * 0.5, 0, sourceWidth - cropWidth);
    sourceY = clamp(sourceHeight * focus.y - cropHeight * 0.35, 0, sourceHeight - cropHeight);

    context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
  }

  function drawChampionPortrait() {
    const theme = FRAME_THEMES[state.photoSlot] || FRAME_THEMES[1];
    const photoEntry = championPhotos.get(state.photoSlot);
    const width = layout.portraitWidth;
    const height = layout.portraitHeight;
    const x = layout.centerX - width / 2;
    const y = layout.portraitTop;
    const photoX = x + width * 0.1;
    const photoY = y + width * 0.1;
    const photoWidth = width * 0.8;
    const photoHeight = width * 0.98;
    const plateY = y + height - width * 0.22;
    const centerY = y + height * 0.45;

    context.save();

    context.strokeStyle = "rgba(255, 225, 138, 0.22)";
    context.lineWidth = 3;
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * TAU;
      context.beginPath();
      context.moveTo(layout.centerX + Math.cos(angle) * width * 0.62, centerY + Math.sin(angle) * width * 0.5);
      context.lineTo(layout.centerX + Math.cos(angle) * width * 0.84, centerY + Math.sin(angle) * width * 0.7);
      context.stroke();
    }

    context.fillStyle = "rgba(28, 18, 12, 0.32)";
    roundedRectangle(x - 10, y + 9, width + 20, height + 12, 6);
    context.fill();

    context.fillStyle = theme.dark;
    roundedRectangle(x - 8, y - 8, width + 16, height + 16, 5);
    context.fill();
    context.strokeStyle = theme.metal;
    context.lineWidth = 4;
    context.stroke();

    context.fillStyle = theme.metal;
    roundedRectangle(x - 3, y - 3, width + 6, height + 6, 3);
    context.fill();
    context.fillStyle = "#2b211a";
    context.fillRect(x + 3, y + 3, width - 6, height - 6);

    context.save();
    roundedRectangle(photoX, photoY, photoWidth, photoHeight, Math.max(2, width * 0.035));
    context.clip();
    if (photoEntry?.loaded) {
      drawImageCover(photoEntry.image, photoX, photoY, photoWidth, photoHeight, state.photoSlot);
    } else {
      context.fillStyle = "#4a4034";
      context.fillRect(photoX, photoY, photoWidth, photoHeight);
      context.fillStyle = "#786a57";
      context.beginPath();
      context.arc(layout.centerX, photoY + photoHeight * 0.38, photoWidth * 0.18, 0, TAU);
      context.fill();
      context.beginPath();
      context.ellipse(layout.centerX, photoY + photoHeight * 0.87, photoWidth * 0.34, photoHeight * 0.3, 0, Math.PI, TAU);
      context.fill();
    }
    context.fillStyle = "rgba(246, 183, 72, 0.08)";
    context.fillRect(photoX, photoY, photoWidth, photoHeight);
    context.restore();

    context.strokeStyle = theme.light;
    context.lineWidth = 2;
    context.strokeRect(photoX - 3, photoY - 3, photoWidth + 6, photoHeight + 6);

    context.fillStyle = theme.ribbon;
    roundedRectangle(x - width * 0.09, plateY, width * 1.18, width * 0.24, 3);
    context.fill();
    context.strokeStyle = theme.light;
    context.lineWidth = 1.5;
    context.stroke();

    const studentName = state.selected?.name || "Campeão";
    let nameSize = Math.max(8, width * 0.105);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#fff2c9";
    do {
      context.font = `700 ${nameSize}px Impact, "Arial Narrow", sans-serif`;
      nameSize -= 0.5;
    } while (context.measureText(studentName.toUpperCase()).width > width * 1.02 && nameSize > 7);
    context.fillText(studentName.toUpperCase(), layout.centerX, plateY + width * 0.105);

    context.fillStyle = theme.dark;
    context.beginPath();
    context.moveTo(layout.centerX - width * 0.22, y - 8);
    context.lineTo(layout.centerX - width * 0.13, y - width * 0.24);
    context.lineTo(layout.centerX, y - width * 0.13);
    context.lineTo(layout.centerX + width * 0.13, y - width * 0.24);
    context.lineTo(layout.centerX + width * 0.22, y - 8);
    context.closePath();
    context.fill();
    context.strokeStyle = theme.metal;
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = theme.metal;
    context.beginPath();
    context.arc(layout.centerX, y - width * 0.12, width * 0.095, 0, TAU);
    context.fill();
    context.fillStyle = theme.dark;
    context.font = `700 ${Math.max(9, width * 0.1)}px Impact, sans-serif`;
    context.fillText(`${state.photoSlot}º`, layout.centerX, y - width * 0.115);

    for (let side = -1; side <= 1; side += 2) {
      for (let leaf = 0; leaf < 4; leaf += 1) {
        context.fillStyle = theme.metal;
        context.beginPath();
        context.ellipse(
          layout.centerX + side * (width * 0.58 + leaf * width * 0.025),
          y + height * (0.27 + leaf * 0.1),
          width * 0.035,
          width * 0.075,
          side * 0.55,
          0,
          TAU,
        );
        context.fill();
      }
    }

    context.restore();
  }

  function drawScene() {
    context.fillStyle = scenePaint.sky;
    context.fillRect(0, 0, layout.width, layout.height);

    const horizon = layout.topY - 28;
    context.fillStyle = "rgba(255, 193, 78, 0.34)";
    context.beginPath();
    context.arc(layout.width * 0.77, Math.max(75, horizon - 55), 48, 0, TAU);
    context.fill();
    context.fillStyle = "#efaa3e";
    context.beginPath();
    context.arc(layout.width * 0.77, Math.max(75, horizon - 55), 31, 0, TAU);
    context.fill();

    const houseWidth = Math.min(100, layout.width * 0.12);
    const houseHeight = houseWidth * 0.58;
    drawHouse(16, horizon - houseHeight, houseWidth, houseHeight, "#6d4936", "#3b2d28");
    drawHouse(layout.width - houseWidth - 16, horizon - houseHeight * 0.82, houseWidth, houseHeight * 0.82, "#75503a", "#402c28");
    if (layout.width > 720) {
      drawHouse(layout.width * 0.18, horizon - houseHeight * 0.62, houseWidth * 0.8, houseHeight * 0.62, "#5c4938", "#342a26");
      drawHouse(layout.width * 0.72, horizon - houseHeight * 0.68, houseWidth * 0.85, houseHeight * 0.68, "#6b4a37", "#382a27");
    }

    context.fillStyle = scenePaint.ground;
    context.fillRect(0, layout.topY, layout.width, layout.height - layout.topY);

    context.fillStyle = "#4b3021";
    context.beginPath();
    context.moveTo(layout.centerX - layout.topHalf - 14, layout.topY);
    context.lineTo(layout.centerX + layout.topHalf + 14, layout.topY);
    context.lineTo(layout.centerX + layout.bottomHalf + 25, layout.bottomY);
    context.lineTo(layout.centerX - layout.bottomHalf - 25, layout.bottomY);
    context.closePath();
    context.fill();

    context.fillStyle = scenePaint.corridor;
    context.beginPath();
    context.moveTo(layout.centerX - layout.topHalf, layout.topY);
    context.lineTo(layout.centerX + layout.topHalf, layout.topY);
    context.lineTo(layout.centerX + layout.bottomHalf, layout.bottomY);
    context.lineTo(layout.centerX - layout.bottomHalf, layout.bottomY);
    context.closePath();
    context.fill();

    const rows = 12;
    for (let row = 0; row < rows; row += 1) {
      const startAmount = Math.pow(row / rows, 1.28);
      const endAmount = Math.pow((row + 1) / rows, 1.28);
      const startY = mix(layout.topY, layout.bottomY, startAmount);
      const endY = mix(layout.topY, layout.bottomY, endAmount);
      const startLeft = corridorLeft(startY) + 6;
      const startRight = corridorRight(startY) - 6;
      const endLeft = corridorLeft(endY) + 6;
      const endRight = corridorRight(endY) - 6;

      if (row % 2 === 0) {
        context.fillStyle = "rgba(255, 227, 171, 0.055)";
        context.beginPath();
        context.moveTo(startLeft, startY);
        context.lineTo(startRight, startY);
        context.lineTo(endRight, endY);
        context.lineTo(endLeft, endY);
        context.closePath();
        context.fill();
      }

      context.strokeStyle = "rgba(75, 47, 28, 0.23)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(endLeft, endY);
      context.lineTo(endRight, endY);
      context.stroke();

      const columns = 3 + Math.floor(endAmount * 3);
      for (let column = 1; column < columns; column += 1) {
        const stagger = row % 2 === 0 ? 0 : 0.5;
        const fraction = (column + stagger) / columns;
        if (fraction >= 1) continue;
        context.beginPath();
        context.moveTo(mix(startLeft, startRight, fraction), startY);
        context.lineTo(mix(endLeft, endRight, fraction), endY);
        context.stroke();
      }
    }

    context.fillStyle = "rgba(140, 54, 39, 0.13)";
    context.beginPath();
    context.moveTo(layout.centerX - layout.topHalf * 0.18, layout.topY);
    context.lineTo(layout.centerX + layout.topHalf * 0.18, layout.topY);
    context.lineTo(layout.centerX + layout.bottomHalf * 0.18, layout.bottomY);
    context.lineTo(layout.centerX - layout.bottomHalf * 0.18, layout.bottomY);
    context.closePath();
    context.fill();

    context.strokeStyle = "rgba(235, 170, 58, 0.48)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(layout.centerX - layout.topHalf * 0.18, layout.topY);
    context.lineTo(layout.centerX - layout.bottomHalf * 0.18, layout.bottomY);
    context.moveTo(layout.centerX + layout.topHalf * 0.18, layout.topY);
    context.lineTo(layout.centerX + layout.bottomHalf * 0.18, layout.bottomY);
    context.stroke();

    for (let index = 1; index <= 4; index += 1) {
      const amount = index / 5;
      const y = mix(layout.topY, layout.bottomY, Math.pow(amount, 1.15));
      const size = mix(5, 13, amount);
      context.save();
      context.translate(layout.centerX, y);
      context.scale(1, 0.48);
      context.rotate(Math.PI / 4);
      context.strokeStyle = "rgba(242, 188, 80, 0.48)";
      context.lineWidth = 2;
      context.strokeRect(-size, -size, size * 2, size * 2);
      context.restore();
    }

    context.strokeStyle = "#4b3021";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(layout.centerX - layout.topHalf, layout.topY);
    context.lineTo(layout.centerX - layout.bottomHalf, layout.bottomY);
    context.moveTo(layout.centerX + layout.topHalf, layout.topY);
    context.lineTo(layout.centerX + layout.bottomHalf, layout.bottomY);
    context.stroke();
    context.strokeStyle = "#d38332";
    context.lineWidth = 2;
    context.stroke();

    drawCeremonyGate();

    for (let index = 0; index < 4; index += 1) {
      const amount = (index + 0.7) / 4.5;
      const y = mix(layout.topY, layout.bottomY, amount);
      const scale = 0.65 + amount * 0.55;
      drawBanner(corridorLeft(y) - 8, y, -1, scale);
      drawBanner(corridorRight(y) + 8, y, 1, scale);
    }

    context.fillStyle = scenePaint.light;
    context.fillRect(0, 0, layout.width, layout.height);
    drawChampionPortrait();
  }

  function drawSpeechBubble(person, x, y, scale) {
    const opacity = clamp((person.bubbleUntil - state.elapsed) * 2, 0, 1);
    if (opacity <= 0) return;
    context.save();
    context.globalAlpha = opacity;
    context.font = `700 ${Math.max(9, 11 * scale)}px ${getComputedStyle(document.body).fontFamily}`;
    const textWidth = context.measureText(person.bubbleText).width;
    const width = textWidth + 18;
    const height = 27 * scale;
    const bubbleX = clamp(x - width / 2, 5, layout.width - width - 5);
    const bubbleY = y - 52 * scale;
    context.fillStyle = "#fff4d1";
    roundedRectangle(bubbleX, bubbleY, width, height, 6);
    context.fill();
    context.fillStyle = "#fff4d1";
    context.beginPath();
    context.moveTo(x - 4, bubbleY + height - 1);
    context.lineTo(x + 6, bubbleY + height - 1);
    context.lineTo(x, bubbleY + height + 8);
    context.closePath();
    context.fill();
    context.fillStyle = "#38291e";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(person.bubbleText, bubbleX + width / 2, bubbleY + height / 2 + 1);
    context.restore();
  }

  function drawCrowdPerson(person) {
    const x = person.side < 0 ? corridorLeft(person.y) - person.offset : corridorRight(person.y) + person.offset;
    const scale = 0.57 + perspectiveAt(person.y) * 0.54;
    const speed = 4 + person.intensity * 5;
    const clap = Math.sin(state.elapsed * speed + person.phase);
    const bounce = Math.abs(Math.sin(state.elapsed * speed * 0.5 + person.phase)) * person.intensity * 2;
    const raised = person.intensity > 0.85 && Math.sin(state.elapsed * 2 + person.phase) > 0.2;

    context.save();
    context.translate(x, person.y - bounce);
    context.scale(scale, scale);

    context.fillStyle = "rgba(20, 24, 18, 0.28)";
    context.beginPath();
    context.ellipse(0, 19, 15, 6, 0, 0, TAU);
    context.fill();

    context.strokeStyle = "#2b2622";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(-4, 11);
    context.lineTo(-6, 22);
    context.moveTo(4, 11);
    context.lineTo(7, 22);
    context.stroke();

    context.fillStyle = person.color;
    roundedRectangle(-11, -7, 22, 25, 5);
    context.fill();
    context.fillStyle = "rgba(239, 215, 160, 0.35)";
    context.fillRect(-9, 2, 18, 5);

    const handY = raised ? -22 : -3 + clap * 3;
    const handX = raised ? 12 : 14 - Math.abs(clap) * 5;
    context.strokeStyle = "#d9ab7b";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-8, -2);
    context.lineTo(-handX, handY);
    context.moveTo(8, -2);
    context.lineTo(handX, handY);
    context.stroke();

    context.fillStyle = "#d9ab7b";
    context.beginPath();
    context.arc(0, -16, 9, 0, TAU);
    context.fill();
    context.fillStyle = "#3b2a24";
    context.beginPath();
    context.arc(0, -18, 9, Math.PI, TAU);
    context.fill();

    const lookDirection = Math.sign(character.x - x) * 1.5;
    context.fillStyle = "#30251e";
    context.beginPath();
    context.arc(-3 + lookDirection, -15, 1, 0, TAU);
    context.arc(3 + lookDirection, -15, 1, 0, TAU);
    context.fill();
    context.restore();

    if (person.bubbleUntil > state.elapsed) drawSpeechBubble(person, x, person.y, scale);
  }

  function drawCrowd() {
    for (let index = 0; index < crowd.length; index += 1) {
      drawCrowdPerson(crowd[index]);
    }
  }

  function drawDestinationMarker() {
    if (!destinationMarker.active) return;
    const pulse = 1 + Math.sin(destinationMarker.age * 7) * 0.14;
    const scale = characterScale(destinationMarker.y);
    context.save();
    context.translate(destinationMarker.x, destinationMarker.y);
    context.scale(pulse * scale, pulse * scale * 0.45);
    context.strokeStyle = "rgba(255, 226, 132, 0.9)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 20, 0, TAU);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, 10, 0, TAU);
    context.stroke();
    context.restore();
  }

  function drawCharacter() {
    const scale = characterScale(character.y);
    const stride = state.moving ? Math.sin(character.walkCycle) : 0;
    const leftLift = state.moving ? Math.max(0, stride) * 5.5 : 0;
    const rightLift = state.moving ? Math.max(0, -stride) * 5.5 : 0;
    const bob = state.moving ? -Math.abs(Math.sin(character.walkCycle)) * 2.2 : Math.sin(state.elapsed * 2.2) * 0.7;
    const sideFacing = Math.abs(character.directionX) > Math.abs(character.directionY) * 0.72;
    const backFacing = !sideFacing && character.directionY < -0.2;
    const flip = sideFacing && character.directionX < 0 ? -1 : 1;
    const isLeader = state.selected?.position === 1;
    const outfitColor = isLeader ? "#a7432c" : state.selected?.position === 2 ? "#3e6579" : "#496d53";
    const accentColor = isLeader ? "#f0ad35" : state.selected?.position === 2 ? "#b8d3d5" : "#d27b42";

    context.save();
    context.translate(character.x, character.y);

    context.fillStyle = "rgba(20, 19, 16, 0.34)";
    context.beginPath();
    context.ellipse(0, 14 * scale, 21 * scale, 8 * scale, 0, 0, TAU);
    context.fill();

    if (isLeader) {
      const aura = 27 + Math.sin(state.elapsed * 3) * 2;
      context.strokeStyle = "rgba(244, 177, 52, 0.38)";
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(0, 2, aura * scale, aura * 0.48 * scale, 0, 0, TAU);
      context.stroke();
    }

    context.scale(scale, scale);
    context.scale(flip, 1);
    context.translate(0, bob);

    if (isLeader) {
      const capeWave = Math.sin(character.walkCycle * 1.7) * (state.moving ? 3.5 : 1.2);
      const trailX = state.moving ? -character.directionX * 8 * flip : Math.sin(state.elapsed * 1.8) * 1.5;
      const trailY = state.moving ? -character.directionY * 7 : 3;
      context.fillStyle = "#8f3327";
      context.beginPath();
      context.moveTo(-13, -6);
      context.quadraticCurveTo(-17 + trailX - capeWave, 10 + trailY, -12 + trailX, 29 + trailY);
      context.lineTo(trailX, 24 + trailY + capeWave * 0.35);
      context.lineTo(12 + trailX, 29 + trailY);
      context.quadraticCurveTo(17 + trailX + capeWave, 10 + trailY, 13, -6);
      context.closePath();
      context.fill();
      context.strokeStyle = "#e9a735";
      context.lineWidth = 2;
      context.stroke();
    } else {
      context.fillStyle = "#44372d";
      roundedRectangle(sideFacing ? 7 : -12, -6, sideFacing ? 10 : 24, 22, 4);
      context.fill();
      context.strokeStyle = "#91714e";
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = "#b48752";
      context.fillRect(sideFacing ? 10 : -8, -2, sideFacing ? 5 : 16, 3);
    }

    const leftFootX = -6 - stride * 3.5;
    const rightFootX = 6 + stride * 3.5;
    const leftFootY = 25 - leftLift;
    const rightFootY = 25 - rightLift;

    context.strokeStyle = "#222724";
    context.lineWidth = 6.5;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(-5, 12);
    context.lineTo(leftFootX, leftFootY);
    context.moveTo(5, 12);
    context.lineTo(rightFootX, rightFootY);
    context.stroke();
    context.strokeStyle = "#18201e";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(leftFootX - 1, leftFootY);
    context.lineTo(leftFootX - 5, leftFootY + 2);
    context.moveTo(rightFootX + 1, rightFootY);
    context.lineTo(rightFootX + 5, rightFootY + 2);
    context.stroke();

    context.fillStyle = outfitColor;
    roundedRectangle(-12, -8, 24, 28, 6);
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.08)";
    roundedRectangle(-8, -6, 6, 22, 3);
    context.fill();
    context.fillStyle = accentColor;
    context.fillRect(-12, 1, 24, 5);

    const armStride = state.moving ? stride * 6 : Math.sin(state.elapsed * 1.8) * 0.6;
    context.strokeStyle = outfitColor;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(-9, -3);
    context.lineTo(-15, 10 + armStride);
    context.moveTo(9, -3);
    context.lineTo(15, 10 - armStride);
    context.stroke();
    context.fillStyle = "#dca678";
    context.beginPath();
    context.arc(-15, 11 + armStride, 3.2, 0, TAU);
    context.arc(15, 11 - armStride, 3.2, 0, TAU);
    context.fill();

    context.fillStyle = "#dca678";
    context.beginPath();
    context.arc(0, -17, 10, 0, TAU);
    context.fill();
    context.fillStyle = "#332621";
    context.beginPath();
    context.arc(0, -20, 10, Math.PI, TAU);
    context.fill();

    context.fillStyle = "#3d4650";
    context.fillRect(-12, -20, 24, 5);
    context.fillStyle = accentColor;
    context.fillRect(-5, -20, 10, 5);
    context.strokeStyle = accentColor;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(11, -18);
    context.quadraticCurveTo(20, -15 + Math.sin(character.walkCycle) * (state.moving ? 4 : 1), 25, -9);
    context.stroke();

    if (backFacing) {
      context.fillStyle = "#332621";
      context.beginPath();
      context.arc(0, -17, 5.5, Math.PI, TAU);
      context.fill();
      context.strokeStyle = accentColor;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(-4, -15);
      context.lineTo(0, -12);
      context.lineTo(4, -15);
      context.stroke();
    } else if (sideFacing) {
      context.fillStyle = "#2c231d";
      context.beginPath();
      context.arc(4, -15, 1.2, 0, TAU);
      context.fill();
      context.strokeStyle = "#8b5b43";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(8, -13);
      context.lineTo(10, -12);
      context.stroke();
    } else {
      context.fillStyle = "#2c231d";
      context.beginPath();
      context.arc(-3, -15, 1.1, 0, TAU);
      context.arc(3, -15, 1.1, 0, TAU);
      context.fill();
    }

    if (isLeader) {
      context.save();
      context.translate(0, 9);
      context.rotate(Math.PI / 4);
      context.strokeStyle = "#ffe08a";
      context.lineWidth = 1.5;
      context.strokeRect(-4, -4, 8, 8);
      context.restore();
    }

    context.restore();
  }

  function drawParticles() {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) continue;
      const opacity = clamp(particle.life / Math.min(0.45, particle.maxLife), 0, 1);
      context.save();
      context.globalAlpha = opacity;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      if (particle.kind === 3) {
        context.globalCompositeOperation = "lighter";
        context.rotate(Math.atan2(particle.velocityY, particle.velocityX) + Math.PI / 2);
        context.strokeStyle = particle.color;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(0, 10);
        context.lineTo(0, -5);
        context.stroke();
        context.fillStyle = "#fff6bd";
        context.beginPath();
        context.arc(0, -5, 2.4, 0, TAU);
        context.fill();
      } else if (particle.kind === 4) {
        context.globalCompositeOperation = "lighter";
        context.strokeStyle = particle.color;
        context.lineWidth = Math.max(1, particle.size * 0.55);
        context.beginPath();
        context.moveTo(-particle.size * 3.3, 0);
        context.lineTo(particle.size, 0);
        context.stroke();
        context.fillStyle = "#fff9d6";
        context.beginPath();
        context.arc(particle.size, 0, Math.max(1, particle.size * 0.48), 0, TAU);
        context.fill();
      } else if (particle.kind === 0) {
        context.beginPath();
        context.moveTo(-particle.size, 0);
        context.quadraticCurveTo(0, -particle.size, particle.size, 0);
        context.quadraticCurveTo(0, particle.size * 0.45, -particle.size, 0);
        context.fill();
        context.strokeStyle = "rgba(73, 49, 28, 0.35)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(-particle.size, 0);
        context.lineTo(particle.size, 0);
        context.stroke();
      } else if (particle.kind === 1) {
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.62);
      } else {
        context.beginPath();
        context.ellipse(0, 0, particle.size * 1.35, particle.size * 0.62, 0, 0, TAU);
        context.fill();
      }
      context.restore();
    }
  }

  function render() {
    drawScene();
    drawDestinationMarker();
    drawCrowd();
    drawCharacter();
    drawParticles();

    context.fillStyle = scenePaint.vignette;
    context.fillRect(0, 0, layout.width, layout.height);
  }

  function gameLoop(timestamp) {
    if (!state.active) return;
    if (!state.lastTime) state.lastTime = timestamp;
    const deltaTime = Math.min((timestamp - state.lastTime) / 1000, 0.05);
    state.lastTime = timestamp;
    update(deltaTime);
    render();
    state.animationId = requestAnimationFrame(gameLoop);
  }

  function handlePointer(event) {
    if (!state.active) return;
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * layout.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * layout.height;
    setDestination(x, y);
  }

  function updateSoundButton() {
    ui.sound.setAttribute("aria-pressed", String(audio.enabled));
    ui.sound.innerHTML = `<span aria-hidden="true">♪</span> Som: ${audio.enabled ? "ligado" : "desligado"}`;
  }

  function showAnnouncement() {
    clearTimeout(state.announcementTimer);
    ui.announcement.classList.remove("game-announcement--hidden");
    state.announcementTimer = window.setTimeout(() => {
      ui.announcement.classList.add("game-announcement--hidden");
    }, 2100);
  }

  function open(participant, photoSlot = participant?.position) {
    if (!participant || typeof participant.score !== "number") return;

    if (state.active) close();
    state.active = true;
    state.selected = participant;
    state.photoSlot = clamp(Math.round(Number(photoSlot) || Number(participant.position) || 1), 1, 3);
    loadChampionPhoto(state.photoSlot);
    state.returnScroll = window.scrollY;
    state.returnFocus = document.activeElement;
    state.elapsed = 0;
    state.lastTime = 0;
    state.nextBubbleAt = 0.2;
    state.ambientParticleTimer = 0;
    state.reactionParticleTimer = 0;

    ui.place.textContent = `${participant.position}º lugar`;
    ui.name.textContent = participant.name;
    ui.score.textContent = `${participant.score} / 32 pontos`;
    ui.title.textContent = participant.isHokage ? "Hokage da turma" : participant.rank.name;

    modal.hidden = false;
    document.body.classList.add("game-open");
    showAnnouncement();
    audio.enableByDefault();
    updateSoundButton();
    resizeGame();
    resetCharacter();
    if (audio.enabled) audio.startAmbient();
    celebrationBurst(false);
    state.animationId = requestAnimationFrame(gameLoop);
    ui.close.focus({ preventScroll: true });
  }

  function close() {
    if (!state.active) return;
    state.active = false;
    cancelAnimationFrame(state.animationId);
    clearTimeout(state.announcementTimer);
    audio.stop();
    modal.hidden = true;
    document.body.classList.remove("game-open");
    window.scrollTo({ top: state.returnScroll, behavior: "auto" });
    if (state.returnFocus instanceof HTMLElement) state.returnFocus.focus({ preventScroll: true });
  }

  canvas.addEventListener("pointerdown", handlePointer, { passive: false });
  ui.close.addEventListener("click", close);
  ui.sound.addEventListener("click", async () => {
    await audio.toggle();
    updateSoundButton();
    if (audio.enabled) audio.celebration();
  });

  window.addEventListener("resize", () => {
    if (!state.active) return;
    cancelAnimationFrame(state.resizeFrame);
    state.resizeFrame = requestAnimationFrame(resizeGame);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.active) close();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.active) state.lastTime = 0;
  });

  window.CeremonyGame = { open, close };
})();
