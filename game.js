// ===== NEON GRAVITY RUNNER =====
// An infinite runner with gravity-flipping mechanics

(function () {
  'use strict';

  // ---- DOM ----
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const bestScoreEl = document.getElementById('bestScore');
  const comboDisplay = document.getElementById('comboDisplay');
  const comboText = document.getElementById('comboText');
  const playBtn = document.getElementById('playBtn');
  const restartBtn = document.getElementById('restartBtn');
  const finalScore = document.getElementById('finalScore');
  const finalBest = document.getElementById('finalBest');
  const finalObstacles = document.getElementById('finalObstacles');
  const finalCombo = document.getElementById('finalCombo');
  const newHighScore = document.getElementById('newHighScore');

  // ---- COLORS ----
  const CYAN = '#00f5ff';
  const MAGENTA = '#ff00aa';
  const YELLOW = '#ffe600';
  const GREEN = '#39ff14';
  const WHITE_DIM = 'rgba(224,230,255,0.12)';

  // ---- GAME SETTINGS ----
  const MARGIN = 60;              // Top/bottom margin for the "lanes"
  const PLAYER_SIZE = 22;
  const GRAVITY_ACCEL = 0.0028;   // Gravity strength (per ms)
  const FLIP_VELOCITY = -0.85;    // Velocity boost on flip
  const BASE_SPEED = 0.32;        // Obstacle scroll speed px/ms
  const SPEED_INCREMENT = 0.008;  // Speed increase per obstacle
  const MAX_SPEED = 0.75;
  const OBSTACLE_GAP_MIN = 260;   // Min horizontal gap between obstacles
  const OBSTACLE_GAP_MAX = 420;
  const OBSTACLE_WIDTH = 32;
  const MIN_OBS_HEIGHT = 60;
  const MAX_OBS_HEIGHT_RATIO = 0.55;
  const INVINCIBLE_MS = 200;      // Brief grace period after flip

  // ---- STATE ----
  let state = 'start'; // start | playing | over
  let W, H;
  let player, obstacles, particles, bgStars;
  let score, combo, maxCombo, obstaclesCleared, speed, elapsed;
  let highScore = parseInt(localStorage.getItem('neonGravityHigh') || '0', 10);
  let lastTime = 0;
  let shakeTimer = 0;
  let flashAlpha = 0;

  // ---- RESIZE ----
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- PLAYER ----
  function createPlayer() {
    return {
      x: W * 0.18,
      y: H * 0.5,
      vy: 0,
      gravityDir: 1,        // 1 = down, -1 = up
      flipTimer: 0,
      trail: [],
      rotation: 0
    };
  }

  // ---- OBSTACLES ----
  function spawnObstacle(x) {
    const maxH = (H - MARGIN * 2) * MAX_OBS_HEIGHT_RATIO;
    const type = Math.random();
    const obs = [];

    if (type < 0.35) {
      // bottom only
      const h = MIN_OBS_HEIGHT + Math.random() * (maxH - MIN_OBS_HEIGHT);
      obs.push({ x, y: H - MARGIN, w: OBSTACLE_WIDTH, h, side: 'bottom', passed: false, color: MAGENTA });
    } else if (type < 0.65) {
      // top only
      const h = MIN_OBS_HEIGHT + Math.random() * (maxH - MIN_OBS_HEIGHT);
      obs.push({ x, y: MARGIN, w: OBSTACLE_WIDTH, h, side: 'top', passed: false, color: CYAN });
    } else {
      // both with gap
      const gap = 100 + Math.random() * 80;
      const topH = MIN_OBS_HEIGHT + Math.random() * (maxH * 0.5 - MIN_OBS_HEIGHT);
      const botH = MIN_OBS_HEIGHT + Math.random() * (maxH * 0.5 - MIN_OBS_HEIGHT);
      const available = H - MARGIN * 2 - topH - botH;
      if (available >= gap) {
        obs.push({ x, y: MARGIN, w: OBSTACLE_WIDTH, h: topH, side: 'top', passed: false, color: CYAN });
        obs.push({ x, y: H - MARGIN, w: OBSTACLE_WIDTH, h: botH, side: 'bottom', passed: false, color: MAGENTA });
      } else {
        // fallback to single
        const h = MIN_OBS_HEIGHT + Math.random() * (maxH - MIN_OBS_HEIGHT);
        obs.push({ x, y: H - MARGIN, w: OBSTACLE_WIDTH, h, side: 'bottom', passed: false, color: MAGENTA });
      }
    }
    return obs;
  }

  // ---- PARTICLES ----
  function spawnTrailParticle() {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.02 + Math.random() * 0.05;
    particles.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(angle) * speed - 0.08,
      vy: Math.sin(angle) * speed,
      life: 400 + Math.random() * 300,
      maxLife: 400 + Math.random() * 300,
      color: player.gravityDir === 1 ? CYAN : MAGENTA,
      size: 2 + Math.random() * 3
    });
  }

  function spawnExplosion(x, y) {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.15 + Math.random() * 0.4;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 500 + Math.random() * 500,
        maxLife: 500 + Math.random() * 500,
        color: [CYAN, MAGENTA, YELLOW, GREEN][Math.floor(Math.random() * 4)],
        size: 2 + Math.random() * 5
      });
    }
  }

  function spawnScoreParticle(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const spd = 0.1 + Math.random() * 0.15;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 300 + Math.random() * 200,
        maxLife: 300 + Math.random() * 200,
        color: YELLOW,
        size: 2 + Math.random() * 3
      });
    }
  }

  // ---- BG STARS ----
  function createStars() {
    bgStars = [];
    for (let i = 0; i < 120; i++) {
      bgStars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: 0.5 + Math.random() * 2,
        speed: 0.02 + Math.random() * 0.06,
        alpha: 0.2 + Math.random() * 0.5
      });
    }
  }

  // ---- INIT / RESET ----
  function initGame() {
    player = createPlayer();
    obstacles = [];
    particles = [];
    score = 0;
    combo = 0;
    maxCombo = 0;
    obstaclesCleared = 0;
    speed = BASE_SPEED;
    elapsed = 0;
    shakeTimer = 0;
    flashAlpha = 0;

    // Pre-spawn some obstacles far ahead
    let ox = W + 200;
    for (let i = 0; i < 5; i++) {
      const group = spawnObstacle(ox);
      obstacles.push(...group);
      ox += OBSTACLE_GAP_MIN + Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN);
    }

    scoreEl.textContent = '0';
    bestScoreEl.textContent = highScore;
    comboDisplay.classList.add('hidden');
  }

  // ---- INPUT ----
  function flip() {
    if (state !== 'playing') return;
    player.gravityDir *= -1;
    player.vy = FLIP_VELOCITY * player.gravityDir;
    player.flipTimer = INVINCIBLE_MS;
    // Burst of particles on flip
    for (let i = 0; i < 12; i++) spawnTrailParticle();
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (state === 'start') startGame();
      else if (state === 'playing') flip();
      else if (state === 'over') restartGame();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'playing') flip();
  });

  playBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', restartGame);

  function startGame() {
    initGame();
    state = 'playing';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function restartGame() {
    gameOverScreen.classList.add('hidden');
    startGame();
  }

  function gameOver() {
    state = 'over';
    spawnExplosion(player.x, player.y);
    shakeTimer = 300;
    flashAlpha = 0.6;

    const isNew = score > highScore;
    if (isNew) {
      highScore = score;
      localStorage.setItem('neonGravityHigh', highScore);
    }

    // Delay showing game-over screen to let explosion play
    setTimeout(() => {
      finalScore.textContent = score;
      finalBest.textContent = highScore;
      finalObstacles.textContent = obstaclesCleared;
      finalCombo.textContent = 'x' + maxCombo;
      newHighScore.classList.toggle('hidden', !isNew);
      hud.classList.add('hidden');
      gameOverScreen.classList.remove('hidden');
    }, 800);
  }

  // ---- COLLISION ----
  function checkCollision() {
    const px = player.x;
    const py = player.y;
    const r = PLAYER_SIZE * 0.5;

    // Ceiling / floor
    if (py - r < MARGIN || py + r > H - MARGIN) return true;

    for (const obs of obstacles) {
      let ox, oy, ow, oh;
      if (obs.side === 'bottom') {
        ox = obs.x; oy = obs.y - obs.h; ow = obs.w; oh = obs.h;
      } else {
        ox = obs.x; oy = obs.y; ow = obs.w; oh = obs.h;
      }

      // Simple AABB vs circle
      const closestX = Math.max(ox, Math.min(px, ox + ow));
      const closestY = Math.max(oy, Math.min(py, oy + oh));
      const dx = px - closestX;
      const dy = py - closestY;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  // ---- UPDATE ----
  function update(dt) {
    elapsed += dt;

    // Player physics
    player.vy += GRAVITY_ACCEL * player.gravityDir * dt;
    player.y += player.vy * dt;
    player.flipTimer = Math.max(0, player.flipTimer - dt);

    // Clamp within bounds (triggers game over on next check)
    player.y = Math.max(MARGIN + PLAYER_SIZE * 0.5, Math.min(H - MARGIN - PLAYER_SIZE * 0.5, player.y));

    // Target rotation based on gravity
    const targetRot = player.gravityDir === 1 ? 0 : Math.PI;
    player.rotation += (targetRot - player.rotation) * 0.12;

    // Trail
    player.trail.push({ x: player.x, y: player.y, life: 250 });
    if (Math.random() < 0.5) spawnTrailParticle();

    // Scroll obstacles
    const dx = speed * dt;
    for (const obs of obstacles) {
      obs.x -= dx;
    }

    // Check passed
    for (const obs of obstacles) {
      if (!obs.passed && obs.x + obs.w < player.x) {
        obs.passed = true;
        score++;
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        obstaclesCleared++;

        // Increase speed
        speed = Math.min(MAX_SPEED, BASE_SPEED + SPEED_INCREMENT * obstaclesCleared);

        scoreEl.textContent = score;
        spawnScoreParticle(player.x, player.y - 30);

        if (combo >= 2) {
          comboDisplay.classList.remove('hidden');
          comboText.textContent = 'x' + combo + ' COMBO';
        }
      }
    }

    // Remove off-screen obstacles & spawn new ones
    obstacles = obstacles.filter(o => o.x + o.w > -100);
    const rightmost = obstacles.reduce((m, o) => Math.max(m, o.x), 0);
    if (rightmost < W + 100) {
      const gap = OBSTACLE_GAP_MIN + Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN);
      const group = spawnObstacle(rightmost + gap);
      obstacles.push(...group);
    }

    // Update trail
    player.trail = player.trail.filter(t => {
      t.life -= dt;
      t.x -= dx * 0.5;
      return t.life > 0;
    });

    // Update particles
    particles = particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // BG stars scroll
    for (const s of bgStars) {
      s.x -= s.speed * dt;
      if (s.x < -5) { s.x = W + 5; s.y = Math.random() * H; }
    }

    // Shake & flash
    shakeTimer = Math.max(0, shakeTimer - dt);
    flashAlpha = Math.max(0, flashAlpha - dt * 0.002);

    // Collision (skip during invincibility)
    if (player.flipTimer <= 0 && checkCollision()) {
      combo = 0;
      comboDisplay.classList.add('hidden');
      gameOver();
    }
  }

  // ---- DRAW ----
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Camera shake
    if (shakeTimer > 0) {
      const intensity = shakeTimer / 300 * 6;
      ctx.save();
      ctx.translate(
        (Math.random() - 0.5) * intensity,
        (Math.random() - 0.5) * intensity
      );
    }

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a0a18');
    bgGrad.addColorStop(0.5, '#0d0d20');
    bgGrad.addColorStop(1, '#0a0a18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (const s of bgStars) {
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = WHITE_DIM;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(0,245,255,0.04)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const scrollOffset = (elapsed * speed * 0.3) % gridSize;
    for (let x = -scrollOffset; x < W; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, MARGIN);
      ctx.lineTo(x, H - MARGIN);
      ctx.stroke();
    }
    for (let y = MARGIN; y <= H - MARGIN; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Ceiling & floor lines
    drawBorderLine(MARGIN);
    drawBorderLine(H - MARGIN);

    // Particles
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Player trail
    for (const t of player.trail) {
      const alpha = t.life / 250 * 0.3;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = player.gravityDir === 1 ? CYAN : MAGENTA;
      ctx.beginPath();
      ctx.arc(t.x, t.y, PLAYER_SIZE * 0.3 * (t.life / 250), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Obstacles
    for (const obs of obstacles) {
      drawObstacle(obs);
    }

    // Player
    if (state === 'playing' || state === 'start') {
      drawPlayer();
    }

    // Flash overlay (on death)
    if (flashAlpha > 0) {
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Scanline overlay
    drawScanlines();

    if (shakeTimer > 0) ctx.restore();
  }

  function drawBorderLine(y) {
    const grad = ctx.createLinearGradient(0, y - 2, 0, y + 2);
    grad.addColorStop(0, 'rgba(0,245,255,0)');
    grad.addColorStop(0.5, 'rgba(0,245,255,0.5)');
    grad.addColorStop(1, 'rgba(0,245,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 1, W, 2);
    // Glow line
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 15;
    ctx.fillRect(0, y - 0.5, W, 1);
    ctx.shadowBlur = 0;
  }

  function drawObstacle(obs) {
    let x = obs.x;
    let y, h;
    if (obs.side === 'bottom') {
      h = obs.h;
      y = obs.y - h;
    } else {
      y = obs.y;
      h = obs.h;
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(x, y, x + obs.w, y + h);
    if (obs.color === MAGENTA) {
      grad.addColorStop(0, 'rgba(255,0,170,0.5)');
      grad.addColorStop(1, 'rgba(255,0,170,0.15)');
    } else {
      grad.addColorStop(0, 'rgba(0,245,255,0.5)');
      grad.addColorStop(1, 'rgba(0,245,255,0.15)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, obs.w, h);

    // Border glow
    ctx.strokeStyle = obs.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = obs.color;
    ctx.shadowBlur = 12;
    ctx.strokeRect(x, y, obs.w, h);
    ctx.shadowBlur = 0;

    // Top/bottom accent
    const accentH = 4;
    ctx.fillStyle = obs.color;
    ctx.shadowColor = obs.color;
    ctx.shadowBlur = 8;
    if (obs.side === 'bottom') {
      ctx.fillRect(x, y, obs.w, accentH);
    } else {
      ctx.fillRect(x, y + h - accentH, obs.w, accentH);
    }
    ctx.shadowBlur = 0;
  }

  function drawPlayer() {
    const { x, y, rotation } = player;
    const s = PLAYER_SIZE;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Glow
    const col = player.gravityDir === 1 ? CYAN : MAGENTA;
    ctx.shadowColor = col;
    ctx.shadowBlur = 20;

    // Triangle
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(s * 0.6, 0);
    ctx.lineTo(-s * 0.4, -s * 0.45);
    ctx.lineTo(-s * 0.4, s * 0.45);
    ctx.closePath();
    ctx.fill();

    // Inner shine
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(s * 0.3, 0);
    ctx.lineTo(-s * 0.15, -s * 0.2);
    ctx.lineTo(-s * 0.15, s * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawScanlines() {
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 2);
    }
  }

  // ---- LOOP ----
  function loop(now) {
    if (state !== 'playing' && state !== 'over') return;

    const dt = Math.min(now - lastTime, 40); // cap at ~25fps min
    lastTime = now;

    if (state === 'playing') update(dt);

    // Keep updating particles during game-over for explosion
    if (state === 'over') {
      particles = particles.filter(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        return p.life > 0;
      });
      for (const s of bgStars) {
        s.x -= s.speed * dt * 0.3;
        if (s.x < -5) { s.x = W + 5; s.y = Math.random() * H; }
      }
      shakeTimer = Math.max(0, shakeTimer - dt);
      flashAlpha = Math.max(0, flashAlpha - dt * 0.002);
    }

    draw();
    requestAnimationFrame(loop);
  }

  // ---- IDLE ANIMATION (START SCREEN) ----
  function idleLoop(now) {
    if (state !== 'start') return;
    const dt = Math.min(now - lastTime, 40);
    lastTime = now;

    for (const s of bgStars) {
      s.x -= s.speed * dt * 0.3;
      if (s.x < -5) { s.x = W + 5; s.y = Math.random() * H; }
    }

    // idle particles
    if (Math.random() < 0.15) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: -0.02 + Math.random() * 0.01,
        vy: (Math.random() - 0.5) * 0.02,
        life: 1500 + Math.random() * 1000,
        maxLife: 1500 + Math.random() * 1000,
        color: [CYAN, MAGENTA, YELLOW][Math.floor(Math.random() * 3)],
        size: 1 + Math.random() * 2.5
      });
    }

    particles = particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });

    ctx.clearRect(0, 0, W, H);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a0a18');
    bgGrad.addColorStop(0.5, '#0d0d20');
    bgGrad.addColorStop(1, '#0a0a18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    for (const s of bgStars) {
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = WHITE_DIM;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    drawScanlines();
    requestAnimationFrame(idleLoop);
  }

  // ---- BOOT ----
  createStars();
  particles = [];
  lastTime = performance.now();
  requestAnimationFrame(idleLoop);
})();
