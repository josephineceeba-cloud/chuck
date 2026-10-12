// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP, ATTACKS, ROUNDS_TO_WIN, ROUND_TIME, NEUTRAL } from '../src/game.js';

// Small seeded RNG so AI behaviour is reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const input = (o = {}) => ({ move: 0, block: false, sprint: false, actions: [], ...o });
const passive = () => input();

/** Start a match and skip the countdown. AI is disabled by passing an explicit in2. */
function fighting(opts = {}) {
  const g = new Game({ rng: mulberry32(1), ...opts });
  g.startMatch(opts.difficulty ?? 1);
  while (g.phase === 'countdown') g.update(STEP, NEUTRAL, input());
  assert.equal(g.phase, 'fight');
  return g;
}

/** Run for `seconds`, feeding inputs from the given functions. Returns every event. */
function run(g, seconds, in1 = passive, in2 = passive) {
  const out = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    out.push(...g.update(STEP, in1(i * STEP), in2 === null ? null : in2(i * STEP)));
  }
  return out;
}

const once = (action) => {
  let sent = false;
  return () => {
    if (sent) return input();
    sent = true;
    return input({ actions: [action] });
  };
};

function placeAdjacent(g, gap = 1.2) {
  g.p1.x = -gap / 2;
  g.p2.x = gap / 2;
}

test('menu is frozen until startMatch', () => {
  const g = new Game();
  const before = JSON.stringify([g.p1, g.p2]);
  for (let i = 0; i < 1000; i++) g.update(STEP, input({ move: 1 }));
  assert.equal(g.phase, 'menu');
  assert.equal(JSON.stringify([g.p1, g.p2]), before);
  assert.equal(g.timeLeft, ROUND_TIME);
});

test('countdown runs 3-2-1 then FIGHT, and inputs are ignored during it', () => {
  const g = new Game({ rng: mulberry32(2) });
  g.startMatch(1);
  const ev = [];
  while (g.phase === 'countdown') ev.push(...g.update(STEP, input({ move: 1, actions: ['light'] }), input()));
  const nums = ev.filter((e) => e.type === 'countdown').map((e) => e.n);
  assert.deepEqual(nums, [3, 2, 1]);
  assert.ok(ev.some((e) => e.type === 'fightStart'));
  assert.equal(g.p1.x, -2.5, 'player must not move during the countdown');
  assert.equal(g.p1.attack, null);
});

test('light attack in range deals damage; out of range does not', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  const ev = run(g, 0.5, once('light'));
  const hit = ev.find((e) => e.type === 'hit');
  assert.ok(hit, 'expected a hit event');
  assert.equal(hit.attacker, 'p1');
  assert.ok(Math.abs(g.p2.hp - (100 - ATTACKS.light.damage)) < 1e-9);

  const g2 = fighting();
  g2.p1.x = -4; g2.p2.x = 4;
  const ev2 = run(g2, 0.6, once('light'));
  assert.equal(ev2.filter((e) => e.type === 'hit').length, 0);
  assert.equal(g2.p2.hp, 100);
});

test('an attack only connects once per swing', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  const ev = run(g, 1, once('heavy'));
  assert.equal(ev.filter((e) => e.type === 'hit').length, 1);
});

test('blocking reduces damage to chip and cannot kill', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  const ev = run(g, 0.5, once('light'), () => input({ block: true }));
  assert.ok(ev.some((e) => e.type === 'block'));
  assert.ok(!ev.some((e) => e.type === 'hit'));
  assert.ok(g.p2.hp < 100 && g.p2.hp >= 100 - ATTACKS.light.damage * 0.5);

  const g2 = fighting();
  placeAdjacent(g2, 1.2);
  g2.p2.hp = 1;
  run(g2, 0.5, once('heavy'), () => input({ block: true }));
  assert.ok(g2.p2.hp >= 1, 'chip damage must not KO');
  assert.equal(g2.phase, 'fight');
});

test('blocking from behind does not work', () => {
  const g = fighting();
  g.p1.x = 1; g.p2.x = 0.0; // p1 stands to the right of p2... then swap sides mid-air isn't modelled;
  // Put p1 on the far side by making p2 face away.
  g.p1.x = -1.2; g.p2.x = 0;
  g.p2.facing = 1; // facing away from p1 (p1 is on the left)
  g.p2.blocking = true;
  const ev = [];
  // stepFighter re-faces grounded fighters toward the opponent, so assert the rule directly:
  const a = ATTACKS.light;
  g.p1.facing = 1;
  g.p1.attack = { type: 'light', t: 0, hit: false, spawned: false, chain: 0 };
  g.p2.facing = 1;
  g.p2.blocking = true;
  g.resolveHit(g.p1, g.p2, 'light', a, null);
  ev.push(...g.events.splice(0));
  assert.ok(ev.some((e) => e.type === 'hit'), 'attack from behind must hit through the guard');
});

test('dodge gives invulnerability frames', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  // p2 swings light; p1 dodges right as it goes active.
  const ev = run(g, 0.5, once('dodge'), once('light'));
  assert.ok(ev.some((e) => e.type === 'dodge'));
  assert.equal(g.p1.hp, 100, 'dodging through the active frames must avoid the hit');
});

test('heavy attack launches and interrupts the victim', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  run(g, 0.35, once('heavy'));
  assert.ok(g.p2.hp < 100);
  assert.ok(g.p2.stun > 0 || g.p2.state === 'hit' || g.p2.state === 'air');
});

test('light attacks chain into a combo and the counter shows it', () => {
  const g = fighting();
  placeAdjacent(g, 1.1);
  let maxCombo = 0;
  const spam = (t) => (Math.floor(t / 0.2) !== Math.floor((t - STEP) / 0.2) ? input({ actions: ['light'] }) : input());
  for (let i = 0; i < 120; i++) {
    const ev = g.update(STEP, spam(i * STEP), passive());
    for (const e of ev) if (e.type === 'hit') maxCombo = Math.max(maxCombo, e.combo);
    if (g.phase !== 'fight') break;
  }
  assert.ok(maxCombo >= 2, `expected a multi-hit combo, got ${maxCombo}`);
});

test('special fires a projectile that damages at range', () => {
  const g = fighting();
  g.p1.x = -4; g.p2.x = 3;
  const ev = run(g, 1.2, once('special'));
  assert.ok(ev.some((e) => e.type === 'projectile'));
  const hit = ev.find((e) => e.type === 'hit');
  assert.ok(hit && hit.projectile, 'projectile should connect');
  assert.ok(g.p2.hp < 100);
  assert.equal(g.projectiles.length, 0);
});

test('special can be blocked and has a cooldown', () => {
  const g = fighting();
  g.p1.x = -4; g.p2.x = 3;
  const ev = run(g, 1.0, once('special'), () => input({ block: true }));
  assert.ok(ev.some((e) => e.type === 'block'));
  assert.ok(g.p1.specialCd > 0);
});

test('KO ends the round, awards a win, then a new round begins', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  g.p2.hp = 3;
  const ev = run(g, 0.5, once('light'));
  assert.ok(ev.some((e) => e.type === 'ko' && e.id === 'p2'));
  const re = ev.find((e) => e.type === 'roundEnd');
  assert.equal(re.winner, 'p1');
  assert.equal(g.p1.wins, 1);
  assert.equal(g.phase, 'ko');
  const more = run(g, 4);
  assert.ok(more.some((e) => e.type === 'roundStart' && e.round === 2));
  assert.equal(g.phase, 'countdown');
  assert.equal(g.p2.hp, 100, 'health resets for the next round');
  assert.equal(g.p1.wins, 1, 'wins persist between rounds');
});

test('first to two rounds wins the match', () => {
  const g = fighting();
  for (let r = 0; r < ROUNDS_TO_WIN; r++) {
    placeAdjacent(g, 1.2);
    g.p2.hp = 1;
    run(g, 0.5, once('light'));
    run(g, 4);
    if (r < ROUNDS_TO_WIN - 1) {
      while (g.phase === 'countdown') g.update(STEP, NEUTRAL, input());
      assert.equal(g.phase, 'fight');
    }
  }
  assert.equal(g.phase, 'matchEnd');
  assert.equal(g.matchWinner, 'p1');
});

test('time up: higher health wins, equal health is a draw', () => {
  const g = fighting();
  g.timeLeft = 0.05;
  g.p1.hp = 80; g.p2.hp = 40;
  const ev = run(g, 0.2);
  assert.ok(ev.some((e) => e.type === 'timeUp'));
  assert.equal(g.roundResult.winner, 'p1');
  assert.equal(g.roundResult.reason, 'time');

  const d = fighting();
  d.timeLeft = 0.05;
  run(d, 0.2);
  assert.equal(d.roundResult.winner, null);
  assert.equal(d.p1.wins, 1);
  assert.equal(d.p2.wins, 1);
});

test('the round ends exactly once even if both fighters would die', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  g.p1.hp = 1; g.p2.hp = 1;
  const ev = run(g, 0.6, once('light'), once('light'));
  assert.equal(ev.filter((e) => e.type === 'roundEnd').length, 1);
  assert.equal(g.p1.wins + g.p2.wins, 1);
});

test('domain expansion needs a full meter, freezes the world, then pressures the opponent', () => {
  const g = fighting();
  g.p1.x = -3; g.p2.x = 3;
  let ev = run(g, 0.2, once('domain'));
  assert.ok(!ev.some((e) => e.type === 'domainStart'), 'must not fire below 100 energy');

  g.p1.energy = 100;
  ev = run(g, 0.05, once('domain'));
  assert.ok(ev.some((e) => e.type === 'domainStart'));
  assert.equal(g.p1.energy, 0);
  assert.ok(g.cinematic, 'cast cinematic should be running');
  const t0 = g.timeLeft;
  run(g, 0.5);
  assert.equal(g.timeLeft, t0, 'timer is paused during the cast');

  run(g, 1);
  assert.equal(g.cinematic, null);
  const hpBefore = g.p2.hp;
  const ev2 = run(g, 2);
  assert.ok(ev2.some((e) => e.type === 'domainTick'));
  assert.ok(g.p2.hp < hpBefore, 'sure-hit damage over time');

  const ev3 = run(g, 7);
  assert.ok(ev3.some((e) => e.type === 'domainEnd' && e.id === 'p1'));
  assert.equal(g.p1.domain.active, false);
});

test('the domain victim cannot charge their meter, and moves slower', () => {
  const g = fighting();
  g.p1.energy = 100;
  run(g, 0.05, once('domain'));
  run(g, 1.2);
  const e0 = g.p2.energy;
  g.p2.energy = e0;
  placeAdjacent(g, 1.2);
  run(g, 0.4, () => input(), once('light')); // p2 hits p1 -> p2 would normally gain meter
  assert.equal(g.p2.energy, e0);
  g.p2.x = 0; g.p1.x = -5.5;
  const x0 = g.p2.x;
  run(g, 1, passive, () => input({ move: 1 }));
  assert.ok(g.p2.x - x0 < 3.4 * 1.0 + 0.3, 'slowed below normal walk speed');
});

test('an action pressed a moment early is buffered, not dropped', () => {
  const g = fighting();
  placeAdjacent(g, 1.2);
  run(g, 0.2, once('light')); // light swing in progress, p2 is now in hitstun
  const hp = g.p2.hp;
  // press heavy during the attack's active/recovery; it should cancel in after the hit connects
  run(g, 0.05, once('heavy'));
  run(g, 0.6);
  assert.ok(g.p2.hp < hp, 'buffered heavy should land after the light hit');
});

test('nothing can go wrong with positions: arena bounds and no NaN', () => {
  const g = fighting({ difficulty: 2 });
  for (let i = 0; i < 120 * 30; i++) {
    const t = i * STEP;
    g.update(STEP, input({ move: Math.sin(t) > 0 ? 1 : -1, sprint: true, block: Math.sin(t * 3) > 0.7 }), null);
    for (const f of g.fighters) {
      for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'energy']) assert.ok(Number.isFinite(f[k]), `${f.id}.${k} = ${f[k]}`);
      assert.ok(Math.abs(f.x) <= 6.1 + 1e-9);
      assert.ok(f.y >= 0);
      assert.ok(f.hp >= 0 && f.hp <= 100);
      assert.ok(f.energy >= 0 && f.energy <= 100);
    }
    if (g.phase === 'matchEnd') break;
  }
});

test('AI vs a simple scripted player: matches always finish, at every difficulty', () => {
  for (const level of [0, 1, 2]) {
    for (let seed = 1; seed <= 6; seed++) {
      const g = new Game({ rng: mulberry32(seed * 7 + level), difficulty: level });
      g.startMatch(level);
      const bot = botPlayer(mulberry32(seed));
      let steps = 0;
      const phases = new Set();
      while (g.phase !== 'matchEnd' && steps < 120 * 60 * 8) {
        g.update(STEP, bot(g), null);
        phases.add(g.phase);
        steps++;
      }
      assert.equal(g.phase, 'matchEnd', `level ${level} seed ${seed} never finished`);
      assert.ok(g.matchWinner);
      for (const p of ['countdown', 'fight', 'ko']) assert.ok(phases.has(p));
    }
  }
});

test('difficulty ordering: a fixed bot wins more often against easier AI', () => {
  const winsAt = (level) => {
    let wins = 0;
    const N = 24;
    for (let seed = 1; seed <= N; seed++) {
      const g = new Game({ rng: mulberry32(seed * 13 + 5), difficulty: level });
      g.startMatch(level);
      const bot = botPlayer(mulberry32(seed + 100));
      let steps = 0;
      while (g.phase !== 'matchEnd' && steps < 120 * 60 * 8) { g.update(STEP, bot(g), null); steps++; }
      if (g.matchWinner === 'p1') wins++;
    }
    return wins / N;
  };
  const easy = winsAt(0);
  const normal = winsAt(1);
  const hard = winsAt(2);
  console.log(`      bot win-rate: easy ${(easy * 100).toFixed(0)}%, normal ${(normal * 100).toFixed(0)}%, hard ${(hard * 100).toFixed(0)}%`);
  // Guards against the AI being unbeatable (or a passive bot "losing" for no reason).
  assert.ok(easy >= 0.8, `a competent bot should usually beat Easy (got ${easy})`);
  assert.ok(normal > hard, `Normal should be easier than Hard (${normal} vs ${hard})`);
  assert.ok(normal > 0.2, `Normal must be beatable (got ${normal})`);
  assert.ok(hard < easy, 'Hard must be harder than Easy');
});

// A decent-but-not-perfect scripted human: approaches, pokes, blocks sometimes.
function botPlayer(rng) {
  let nextDecision = 0;
  let mode = 'approach';
  let until = 0;
  return (g) => {
    const out = { move: 0, block: false, sprint: false, actions: [] };
    const me = g.p1, op = g.p2;
    const d = op.x - me.x, ad = Math.abs(d);
    if (g.time >= nextDecision) {
      nextDecision = g.time + 0.2 + rng() * 0.2;
      const threat = op.attack && ad < 2.6;
      const r = rng();
      if (threat && r < 0.5) { mode = 'block'; until = g.time + 0.35; }
      else if (me.energy >= 100 && r < 0.8) out.actions.push('domain');
      else if (ad > 3.5 && me.specialCd <= 0 && r < 0.5) out.actions.push('special');
      else if (ad > 1.4) { mode = 'approach'; until = g.time + 0.3; }
      else { out.actions.push(r < 0.7 ? 'light' : 'heavy'); mode = 'idle'; until = g.time + 0.1; }
    }
    if (g.time < until) {
      if (mode === 'approach') out.move = Math.sign(d);
      if (mode === 'block') out.block = true;
    }
    return out;
  };
}
