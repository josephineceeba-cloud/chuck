// CLUCKED: Cursed Domains — entry point.
//
// Order matters here: the menu, buttons and keyboard are wired up FIRST and never
// depend on the 3D library. Three.js is then loaded in the background (local copy,
// then CDNs, each with a timeout). The Start button shows what's going on
// (LOADING… / START FIGHT / RETRY) instead of silently doing nothing.

import { Game, STEP, AI_LEVELS, DOMAIN_NAMES } from './game.js';
import { Input, bindTouchControls } from './input.js';
import { Sfx } from './audio.js';
import { createView } from './view.js';

const $ = (s) => document.querySelector(s);
const el = {
  stage: $('#stage'), overlay: $('#overlay'), pause: $('#pause'), start: $('#start'),
  restart: $('#restart'), resume: $('#resume'), quit: $('#quit'), pausebtn: $('#pausebtn'), mute: $('#mute'),
  status: $('#status'), banner: $('#banner'), callout: $('#callout'), flash: $('#flash'), vignette: $('#vignette'),
  combo: $('#combo'), combonum: $('#combonum'), floaters: $('#floaters'), touch: $('#touch'),
  result: $('#result'), desc: $('#desc'), loaderror: $('#loaderror'), difficulty: $('#difficulty'),
  timer: $('#timer'), roundlabel: $('#roundlabel'),
  hp: [$('#p1hp'), $('#p2hp')], trail: [$('#p1trail'), $('#p2trail')],
  energy: [$('#p1energy'), $('#p2energy')], energybar: [$('#p1energybar'), $('#p2energybar')],
  label: [$('#p1label'), $('#p2label')], pips: [$('#pips1'), $('#pips2')],
};

const DEFAULT_BANNER = 'CUTE CHICKENS. DEADLY DOMAINS.';
const LOAD_TIMEOUT_MS = 9000;

// The bundled copy (vendor/three.module.js, Three.js r169) goes first so the game works
// offline and never depends on a CDN being reachable. CDNs are only a fallback.
const THREE_SOURCES = [
  new URL('../vendor/three.module.js', import.meta.url).href,
  'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js',
  'https://unpkg.com/three@0.169.0/build/three.module.js',
  'https://esm.sh/three@0.169.0',
];

const game = new Game({ difficulty: loadLevel() });
const input = new Input();
const sfx = new Sfx();
const engine = { status: 'loading', view: null };
let paused = false;
let acc = 0;
let last = performance.now();
let comboTimer = 0;
let frameFailed = false;

// ---- small helpers --------------------------------------------------------

function loadLevel() {
  try {
    const v = Number(localStorage.getItem('clucked.level'));
    return Number.isInteger(v) && v >= 0 && v < AI_LEVELS.length ? v : 1;
  } catch {
    return 1;
  }
}

const textCache = new WeakMap();
function setText(node, text) {
  if (textCache.get(node) !== text) {
    textCache.set(node, text);
    node.textContent = text;
  }
}
const styleCache = new WeakMap();
function setWidth(node, pct) {
  const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  if (styleCache.get(node) !== v) {
    styleCache.set(node, v);
    node.style.width = v;
  }
}

function withTimeout(promise, ms, what) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function loadThree() {
  let lastErr;
  for (const url of THREE_SOURCES) {
    try {
      return await withTimeout(import(/* webpackIgnore: true */ url), LOAD_TIMEOUT_MS, url);
    } catch (err) {
      lastErr = err;
      console.warn('[clucked] could not load Three.js from', url, err);
    }
  }
  throw lastErr || new Error('Three.js could not be loaded');
}

// ---- engine (3D) loading --------------------------------------------------

function showLoadError(msg) {
  el.loaderror.textContent = msg;
  el.loaderror.classList.toggle('hidden', !msg);
}

function refreshStartButton() {
  const b = el.start;
  if (engine.status === 'loading') {
    b.disabled = true;
    b.textContent = 'LOADING…';
  } else if (engine.status === 'failed') {
    b.disabled = false;
    b.textContent = 'RETRY LOADING';
  } else {
    b.disabled = false;
    b.textContent = game.phase === 'matchEnd' ? 'REMATCH' : 'START FIGHT';
  }
}

async function loadEngine() {
  engine.status = 'loading';
  showLoadError('');
  refreshStartButton();
  try {
    const THREE = await loadThree();
    engine.view = createView(THREE, el.stage);
    engine.status = 'ready';
  } catch (err) {
    console.error('[clucked] 3D engine failed to start', err);
    engine.status = 'failed';
    const webgl = /webgl/i.test(String(err && err.message));
    showLoadError(
      webgl
        ? 'Your browser could not start WebGL (3D graphics). Turn on hardware acceleration or try another browser, then press Retry.'
        : 'Could not load the 3D engine (Three.js). Check your internet connection, then press Retry. ' +
          'Offline? Put three.module.js in a "vendor" folder next to index.html.',
    );
  }
  refreshStartButton();
}

// ---- UI state -------------------------------------------------------------

function setStatus(s) { setText(el.status, s); }
function setBanner(s) { setText(el.banner, s); }

function callout(text, cls = '') {
  const c = el.callout;
  c.className = '';
  void c.offsetWidth; // restart the CSS animation
  c.textContent = text;
  c.className = `show ${cls}`;
}

function flash(color = '#fff') {
  el.flash.style.background = color;
  el.flash.classList.remove('go');
  void el.flash.offsetWidth;
  el.flash.classList.add('go');
}

function floatText(text, id, cls = '') {
  const view = engine.view;
  if (!view) return;
  const f = game.byId(id);
  const p = view.project(f.x, f.y + 2.1);
  const d = document.createElement('div');
  d.className = `float ${id} ${cls}`.trim();
  d.textContent = text;
  d.style.left = `${p.x + (Math.random() - 0.5) * 50}px`;
  d.style.top = `${p.y}px`;
  while (el.floaters.children.length > 14) el.floaters.firstChild.remove();
  el.floaters.append(d);
  setTimeout(() => d.remove(), 950);
}

function showCombo(n, attackerId) {
  if (n < 2) return;
  el.combonum.textContent = String(n);
  el.combo.style.color = attackerId === 'p1' ? '#fff' : '#ffb3c6';
  el.combo.classList.remove('hidden', 'pop');
  void el.combo.offsetWidth;
  el.combo.classList.add('pop');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => el.combo.classList.add('hidden'), 1300);
}

function clearTransient() {
  clearTimeout(comboTimer);
  el.combo.classList.add('hidden');
  el.floaters.replaceChildren();
  el.callout.className = '';
  el.vignette.classList.remove('low');
}

function isPlaying() {
  return game.phase === 'countdown' || game.phase === 'fight' || game.phase === 'ko';
}

// ---- flow: start / pause / quit ------------------------------------------

function startFight() {
  if (engine.status === 'failed') {
    loadEngine();
    return;
  }
  if (engine.status !== 'ready') return;
  sfx.unlock();
  sfx.play('ui');
  document.activeElement?.blur?.();
  el.overlay.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.result.classList.add('hidden');
  paused = false;
  clearTransient();
  game.startMatch(Number(el.difficulty.dataset.level ?? game.difficulty));
  input.clear();
  input.setEnabled(true);
  acc = 0; // never carry idle time into the simulation
  last = performance.now();
  setBanner(DEFAULT_BANNER);
  setStatus('GET READY');
}

function setPaused(on) {
  if (on === paused) return;
  if (on && !isPlaying()) return;
  paused = on;
  el.pause.classList.toggle('hidden', !on);
  input.setEnabled(!on); // no keys queued while paused (also clears anything held)
  if (on) setStatus('PAUSED');
  else {
    last = performance.now();
    acc = 0;
    setStatus(game.phase === 'fight' ? 'FIGHT IN PROGRESS' : game.phase === 'ko' ? 'ROUND OVER' : 'GET READY');
    document.activeElement?.blur?.();
  }
}

function quitToMenu() {
  paused = false;
  el.pause.classList.add('hidden');
  game.toMenu();
  input.setEnabled(false);
  clearTransient();
  setBanner(DEFAULT_BANNER);
  setStatus('READY TO FIGHT');
  el.result.classList.add('hidden');
  el.desc.classList.remove('hidden');
  el.overlay.classList.remove('hidden');
  refreshStartButton();
}

function setLevel(level) {
  el.difficulty.dataset.level = String(level);
  el.difficulty.querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-checked', String(Number(b.dataset.level) === level));
  });
  game.difficulty = level;
  try {
    localStorage.setItem('clucked.level', String(level));
  } catch { /* storage unavailable */ }
}

function updateMuteIcon() {
  el.mute.textContent = sfx.muted ? '🔇' : '🔊';
  el.mute.setAttribute('aria-pressed', String(sfx.muted));
}

// ---- game events -> sound, text, effects ---------------------------------

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'roundStart':
        setText(el.roundlabel, `ROUND ${e.round}`);
        setBanner(DEFAULT_BANNER);
        setStatus('GET READY');
        clearTransient();
        break;
      case 'countdown':
        callout(String(e.n));
        sfx.play('count');
        break;
      case 'fightStart':
        callout('FIGHT!');
        sfx.play('go');
        setStatus('FIGHT IN PROGRESS');
        break;
      case 'swing':
        sfx.play(`swing-${e.attack}`);
        break;
      case 'hit':
        sfx.play(`hit-${e.attack}`);
        floatText(`-${Math.max(1, Math.round(e.damage))}`, e.target, e.attack === 'heavy' || e.combo >= 3 ? 'big' : '');
        showCombo(e.combo, e.attacker);
        break;
      case 'block':
        sfx.play('block');
        floatText('BLOCK', e.target, 'block');
        break;
      case 'jump': sfx.play('jump'); break;
      case 'land': sfx.play('land'); break;
      case 'dodge': sfx.play('dodge'); break;
      case 'clash': sfx.play('clash'); break;
      case 'domainStart':
        sfx.play('domain');
        flash(e.id === 'p1' ? '#a8f4ff' : '#d9a0ff');
        callout('DOMAIN EXPANSION', 'long');
        setBanner(e.name || DOMAIN_NAMES[e.id]);
        break;
      case 'domainTick':
        floatText('-1', e.target, 'dot');
        break;
      case 'domainEnd':
        sfx.play('domain-end');
        setBanner(DEFAULT_BANNER);
        break;
      case 'ko':
        sfx.play('ko');
        flash('#ffffff');
        callout('K.O.!', 'ko long');
        break;
      case 'timeUp':
        callout('TIME!', 'long');
        break;
      case 'roundEnd': {
        setStatus(e.matchWinner ? 'MATCH OVER' : 'ROUND OVER');
        const w = e.winner;
        const name = w ? game.byId(w).name : null;
        setBanner(name ? `${name} WINS THE ROUND!` : 'DRAW!');
        if (w === 'p1') sfx.play('win');
        else if (w === 'p2') sfx.play('lose');
        break;
      }
      case 'matchEnd':
        showMatchResult(e.winner);
        break;
      default: break;
    }
  }
}

function showMatchResult(winner) {
  input.setEnabled(false);
  const r = el.result;
  r.className = winner === 'p1' ? 'win' : winner === 'p2' ? 'lose' : 'draw';
  r.innerHTML = '';
  r.append(winner === 'p1' ? 'YOU WIN!' : winner === 'p2' ? 'YOU LOSE' : 'DRAW');
  const small = document.createElement('small');
  small.textContent = `ROUNDS ${game.p1.wins} – ${game.p2.wins}`;
  r.append(small);
  el.desc.classList.add('hidden');
  el.overlay.classList.remove('hidden');
  setStatus('MATCH OVER');
  setBanner(winner === 'draw' ? 'DRAW!' : `${game.byId(winner).name} IS THE CHAMPION!`);
  refreshStartButton();
}

// ---- HUD ------------------------------------------------------------------

function updateHud() {
  const fighters = [game.p1, game.p2];
  fighters.forEach((f, i) => {
    setWidth(el.hp[i], f.hp);
    setWidth(el.trail[i], f.hp);
    setWidth(el.energy[i], f.energy);
    const ready = f.energy >= 100;
    el.energybar[i].classList.toggle('full', ready);
    const hint = ready ? (i === 0 ? ' · DOMAIN READY — PRESS Q' : ' · DOMAIN READY') : ` · ${Math.floor(f.energy)}% DOMAIN`;
    setText(el.label[i], `${Math.ceil(f.hp)} / 100 HP${hint}`);
    [...el.pips[i].children].forEach((pip, n) => pip.classList.toggle('on', f.wins > n));
  });
  setText(el.timer, String(Math.ceil(game.timeLeft)));
  el.timer.classList.toggle('low', game.phase === 'fight' && game.timeLeft <= 10);
  el.vignette.classList.toggle('low', game.phase === 'fight' && !game.p1.ko && game.p1.hp <= 25);
}

// ---- main loop ------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  try {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const events = game.events.splice(0); // e.g. the 'roundStart' queued by startMatch()

    if (isPlaying() && !paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 24) {
        events.push(...game.update(STEP, input.read()));
        acc -= STEP;
        steps++;
      }
      if (steps >= 24) acc = 0; // a long stall: drop the backlog instead of fast-forwarding
    } else {
      acc = 0; // idle time must never become simulation time
    }

    handleEvents(events);
    updateHud();
    if (engine.view) {
      const vdt = paused ? 0 : game.phase === 'ko' ? dt * game.timeScale : dt;
      engine.view.render(vdt, game, events, now / 1000);
    }
  } catch (err) {
    if (!frameFailed) {
      frameFailed = true;
      console.error('[clucked] frame error (further errors suppressed)', err);
    }
  }
}

// ---- wire everything up (before anything async) ---------------------------

el.start.addEventListener('click', startFight);
el.restart.addEventListener('click', startFight);
el.resume.addEventListener('click', () => setPaused(false));
el.quit.addEventListener('click', quitToMenu);
el.pausebtn.addEventListener('click', () => setPaused(!paused));
el.mute.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  sfx.unlock();
  sfx.play('ui');
  updateMuteIcon();
  el.mute.blur();
});
el.difficulty.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    setLevel(Number(b.dataset.level));
    sfx.unlock();
    sfx.play('ui');
  });
});

input.attach(window);
bindTouchControls(el.touch, input);
if (matchMedia('(pointer: coarse)').matches) el.touch.classList.remove('hidden');

addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'KeyM') {
    sfx.setMuted(!sfx.muted);
    updateMuteIcon();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!el.overlay.classList.contains('hidden')) return;
    setPaused(!paused);
  } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.target.tagName !== 'BUTTON') {
    if (paused) setPaused(false);
    else if (!el.overlay.classList.contains('hidden')) startFight();
  }
});

// Never let the match run while nobody is looking.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});
addEventListener('blur', () => setPaused(true));
addEventListener('resize', () => engine.view?.resize());

setLevel(game.difficulty);
updateMuteIcon();
setStatus('READY TO FIGHT');
refreshStartButton();
requestAnimationFrame(frame);
loadEngine();
