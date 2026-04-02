/**
 * Bus Cursor Animation
 * College Bus Transport Information System — VAST
 * --------------------------------------------------
 * Features:
 *   • Custom 🚌 emoji cursor (replaces default cursor)
 *   • Smoke / dust particle trail while mouse is moving
 *   • Soft bus-horn sound (Web Audio API, generated — no external file needed)
 *   • Mute toggle button (bottom-right corner)
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────
     1.  CURSOR ELEMENT
  ────────────────────────────────────────── */
  const cursor = document.createElement('div');
  cursor.id = 'bus-cursor';
  cursor.textContent = '🚌';
  document.body.appendChild(cursor);

  // Hide native cursor site-wide
  const cursorStyle = document.createElement('style');
  cursorStyle.textContent = `
    *, *::before, *::after { cursor: none !important; }

    #bus-cursor {
      position: fixed;
      top: 0; left: 0;
      font-size: 28px;
      line-height: 1;
      pointer-events: none;
      z-index: 99999;
      transform: translate(-50%, -50%);
      transition: transform 0.08s ease;
      user-select: none;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
      will-change: transform, left, top;
    }

    /* Mute toggle button */
    #bus-mute-btn {
      position: fixed;
      bottom: 50px;
      right: 16px;
      z-index: 99998;
      background: #7b3b00;
      color: white;
      border: none;
      border-radius: 50px;
      padding: 6px 14px;
      font-size: 13px;
      font-family: 'Inter', sans-serif;
      cursor: pointer !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s, transform 0.15s;
      user-select: none;
    }
    #bus-mute-btn:hover {
      background: #5a2c00;
      transform: scale(1.05);
    }

    /* Smoke / dust particles */
    .bus-smoke {
      position: fixed;
      pointer-events: none;
      z-index: 99997;
      border-radius: 50%;
      opacity: 0.75;
      will-change: transform, opacity;
      animation: busSmokeAnim var(--dur, 0.7s) ease-out forwards;
    }

    @keyframes busSmokeAnim {
      0%   { transform: translate(0, 0) scale(1);    opacity: 0.7; }
      100% { transform: translate(var(--tx), var(--ty)) scale(2.5); opacity: 0; }
    }
  `;
  document.head.appendChild(cursorStyle);

  /* ──────────────────────────────────────────
     2.  MUTE TOGGLE
  ────────────────────────────────────────── */
  let muted = false;

  const muteBtn = document.createElement('button');
  muteBtn.id = 'bus-mute-btn';
  muteBtn.innerHTML = '🔊 Bus Horn';
  muteBtn.title = 'Toggle bus-horn sound';
  document.body.appendChild(muteBtn);

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.innerHTML = muted ? '🔇 Bus Horn' : '🔊 Bus Horn';
  });

  // Restore native cursor on the mute button itself
  muteBtn.style.cssText += 'cursor: pointer !important;';

  /* ──────────────────────────────────────────
     3.  WEB AUDIO — BUS HORN
  ────────────────────────────────────────── */
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  /**
   * Generates a short, soft bus-horn "beep" using Web Audio API.
   * No external audio file required.
   */
  function playHorn() {
    if (muted) return;
    try {
      const ctx = getAudioCtx();
      const t = ctx.currentTime;

      // Main horn tone (two-tone: fundamental + minor third above)
      const freqs = [233, 277]; // B♭3 and D♭4 — classic bus horn interval
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, t);
      masterGain.gain.linearRampToValueAtTime(0.12, t + 0.04);
      masterGain.gain.setValueAtTime(0.12, t + 0.18);
      masterGain.gain.linearRampToValueAtTime(0, t + 0.36);
      masterGain.connect(ctx.destination);

      freqs.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        // slight vibrato
        osc.frequency.linearRampToValueAtTime(freq * 1.008, t + 0.12);
        osc.frequency.linearRampToValueAtTime(freq, t + 0.36);
        gain.gain.setValueAtTime(0.5, t);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.38);
      });
    } catch (e) {
      // Silently fail if audio not supported
    }
  }

  /* Horn probability & throttle */
  let lastHornTime = 0;
  const HORN_COOLDOWN_MS = 8000;   // minimum gap between horns
  const HORN_PROBABILITY = 0.004;  // ~0.4% chance per mouse-move event

  function maybePlayHorn() {
    const now = Date.now();
    if ((now - lastHornTime) < HORN_COOLDOWN_MS) return;
    if (Math.random() < HORN_PROBABILITY) {
      lastHornTime = now;
      playHorn();
    }
  }

  /* ──────────────────────────────────────────
     4.  MOUSE TRACKING & CURSOR POSITION
  ────────────────────────────────────────── */
  let mouseX = -200, mouseY = -200;
  let prevX = -200, prevY = -200;
  let isMoving = false;
  let moveTimer = null;

  // Particle pool to avoid constant DOM churn
  const MAX_PARTICLES = 40;
  const particlePool = [];
  let poolIndex = 0;

  function createParticleEl() {
    const el = document.createElement('div');
    el.className = 'bus-smoke';
    document.body.appendChild(el);
    return el;
  }

  // Pre-populate pool
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particlePool.push(createParticleEl());
  }

  /* ──────────────────────────────────────────
     5.  SMOKE PARTICLE SPAWNING
  ────────────────────────────────────────── */
  let lastParticleTime = 0;
  const PARTICLE_INTERVAL_MS = 40; // spawn at most once per 40 ms

  const SMOKE_COLORS = [
    'rgba(160,160,160,VAL)',
    'rgba(180,140,100,VAL)',
    'rgba(200,170,130,VAL)',
    'rgba(140,140,140,VAL)',
  ];

  function spawnParticle(x, y) {
    const now = performance.now();
    if (now - lastParticleTime < PARTICLE_INTERVAL_MS) return;
    lastParticleTime = now;

    const el = particlePool[poolIndex % MAX_PARTICLES];
    poolIndex++;

    // Spawn slightly behind the bus (to the left / opposite motion direction)
    const dx = x - prevX;
    const dy = y - prevY;
    const angle = Math.atan2(dy, dx);
    const offsetDist = 18;

    const spawnX = x - Math.cos(angle) * offsetDist + (Math.random() - 0.5) * 6;
    const spawnY = y - Math.sin(angle) * offsetDist + (Math.random() - 0.5) * 6;

    const size = 6 + Math.random() * 8; // px
    const duration = 0.5 + Math.random() * 0.4; // seconds
    const colorTemplate = SMOKE_COLORS[Math.floor(Math.random() * SMOKE_COLORS.length)];
    const opacity = 0.5 + Math.random() * 0.35;
    const color = colorTemplate.replace('VAL', opacity.toFixed(2));

    // Drift direction (mostly backward + slight upward)
    const driftAngle = angle + Math.PI + (Math.random() - 0.5) * 0.8;
    const driftDist = 20 + Math.random() * 30;
    const tx = Math.cos(driftAngle) * driftDist + 'px';
    const ty = (Math.sin(driftAngle) * driftDist - 10 - Math.random() * 10) + 'px';

    // Reset animation by cloning trick (toggle class)
    el.style.cssText = `
      left: ${spawnX}px;
      top: ${spawnY}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      --dur: ${duration}s;
      --tx: ${tx};
      --ty: ${ty};
      animation: none;
    `;

    // Force reflow to restart animation
    void el.offsetWidth;
    el.style.animation = `busSmokeAnim ${duration}s ease-out forwards`;
  }

  /* ──────────────────────────────────────────
     6.  EVENT LISTENERS
  ────────────────────────────────────────── */
  document.addEventListener('mousemove', (e) => {
    prevX = mouseX;
    prevY = mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;

    // Move cursor element
    cursor.style.left = mouseX + 'px';
    cursor.style.top  = mouseY + 'px';

    // Slight "driving tilt" based on horizontal speed
    const vx = mouseX - prevX;
    const tiltDeg = Math.max(-15, Math.min(15, vx * 1.2));
    cursor.style.transform = `translate(-50%, -50%) rotate(${tiltDeg}deg)`;

    // Spawn smoke
    isMoving = true;
    spawnParticle(mouseX, mouseY);

    // Idle detection
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      isMoving = false;
      cursor.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    }, 150);

    maybePlayHorn();
  }, { passive: true });

  // Play horn on click too (with separate probability gate)
  document.addEventListener('click', () => {
    const now = Date.now();
    if ((now - lastHornTime) > 3000 && Math.random() < 0.35) {
      lastHornTime = now;
      playHorn();
    }
  });

  // Show/hide cursor when it enters/leaves the window
  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
  });

  /* ──────────────────────────────────────────
     7.  INITIAL HIDE (before first move)
  ────────────────────────────────────────── */
  cursor.style.left = '-200px';
  cursor.style.top  = '-200px';

})();
