// CLUCKED: Cursed Domains — pure game logic.
// No DOM and no Three.js in here, so the rules can be unit-tested in Node.
// The view (view.js) and the glue (main.js) only *read* this state and the
// events it emits.

export const STEP = 1 / 120; // fixed simulation step (seconds)
export const ARENA_HALF = 6.1;
export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;
export const COUNTDOWN_STEP = 0.8; // seconds per "3, 2, 1"
export const KO_TOTAL = 3.2; // seconds spent on the KO / round-end screen
export const KO_SLOWMO = 1.3; // part of it played in slow motion

const FIGHT_AT = COUNTDOWN_STEP * 3;
const GRAVITY = 18;
const JUMP_V = 7.4;
const WALK = 3.4;
const SPRINT = 5.4;
const DODGE_SPEED = 8.5;
const DODGE_TIME = 0.22;
const DODGE_INVULN = 0.27;
const DODGE_CD = 0.75;
const BUFFER_TIME = 0.16; // how long a pressed action waits for a free moment
const MIN_GAP = 0.85; // fighters can't overlap closer than this
const DOMAIN_TIME = 7;
const DOMAIN_CD = 4;
const DOMAIN_CAST = 0.95;
const DOMAIN_TICK = 0.5;
const DOMAIN_TICK_DAMAGE = 1;

export const DOMAIN_NAMES = {
  p1: 'DOMAIN: GOLDEN COOP OF INFINITY',
  p2: 'DOMAIN: ETERNAL NEST OF SHADOWS',
};

// Frame data in seconds. Damage is out of 100 HP.
export const ATTACKS = {
  light: {
    startup: 0.07, active: 0.09, recover: 0.17,
    damage: 6, range: 1.5, hitstun: 0.26, blockstun: 0.14,
    knock: 2.6, blockPush: 1.8, gain: 7, hitstop: 0.05, lunge: 1.6, chip: 0.1,
  },
  heavy: {
    startup: 0.2, active: 0.1, recover: 0.36,
    damage: 13, range: 1.95, hitstun: 0.44, blockstun: 0.24,
    knock: 5.0, blockPush: 3.4, gain: 12, hitstop: 0.1, lunge: 2.6, chip: 0.22, launch: 2.6,
  },
  special: {
    startup: 0.3, active: 0.04, recover: 0.4,
    damage: 11, range: 0, hitstun: 0.5, blockstun: 0.2,
    knock: 4.2, blockPush: 2.6, gain: 8, hitstop: 0.07, lunge: 0, chip: 0.18,
    cooldown: 1.8, projectile: true, speed: 9.5,
  },
};
for (const a of Object.values(ATTACKS)) a.total = a.startup + a.active + a.recover;

// Index = difficulty level (0 easy, 1 normal, 2 hard).
// react: seconds between decisions. block/dodge: chance to react to an incoming attack.
// aggr: chance to attack (vs. back off) when in range. spacing: distance it fights from.
// punish: chance to punish an attack that is in its recovery frames.
export const AI_LEVELS = [
  { name: 'EASY', react: 0.34, block: 0.1, dodge: 0.02, aggr: 0.45, spacing: 1.3, punish: 0.1 },
  { name: 'NORMAL', react: 0.2, block: 0.3, dodge: 0.06, aggr: 0.75, spacing: 1.65, punish: 0.5 },
  { name: 'HARD', react: 0.14, block: 0.42, dodge: 0.08, aggr: 0.85, spacing: 1.75, punish: 0.65 },
];

export const NEUTRAL = Object.freeze({ move: 0, block: false, sprint: false, actions: Object.freeze([]) });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function makeFighter(id, name, x) {
  return {
    id, name, baseX: x,
    x, y: 0, vx: 0, vy: 0, facing: x < 0 ? 1 : -1, grounded: true,
    hp: 100, energy: 0,
    state: 'idle',
    attack: null, // { type, t, hit, spawned, chain }
    stun: 0, blockstun: 0, invuln: 0, dodgeT: 0, dodgeDir: 1, dodgeMove: 0, hitstop: 0, flash: 0,
    blocking: false, ko: false,
    wins: 0,
    combo: 0, comboGrace: 0,
    dodgeCd: 0, specialCd: 0,
    buf: null, bufT: 0,
    domain: { active: false, t: 0, cd: 0, tick: 0 },
    ai: { t: 0, mode: 'idle', modeT: 0 },
  };
}

export class Game {
  constructor({ rng = Math.random, difficulty = 1 } = {}) {
    this.rng = rng;
    this.difficulty = difficulty;
    this.p1 = makeFighter('p1', 'SUNNY PECK', -2.5);
    this.p2 = makeFighter('p2', 'SHADOW CLUCK', 2.5);
    this.fighters = [this.p1, this.p2];
    this.projectiles = [];
    this._projId = 1;
    this.events = [];

    this.phase = 'menu'; // menu | countdown | fight | ko | matchEnd
    this.phaseT = 0;
    this.round = 1;
    this.timeLeft = ROUND_TIME;
    this.timeScale = 1;
    this.cinematic = null; // { owner, t } while a domain is being cast
    this.roundResult = null; // { winner: 'p1'|'p2'|null, reason }
    this.matchWinner = null; // 'p1' | 'p2' | 'draw' | null
    this.countdownLabel = '';
    this._lastCount = 0;
    this.time = 0; // total simulated seconds, handy for AI/tests
  }

  // ---- public API ---------------------------------------------------------

  startMatch(difficulty = this.difficulty) {
    this.difficulty = clamp(difficulty | 0, 0, AI_LEVELS.length - 1);
    this.p1.wins = 0;
    this.p2.wins = 0;
    this.round = 1;
    this.matchWinner = null;
    this.roundResult = null;
    this.beginRound();
  }

  /** Back to the title screen with a fresh arena (used by "Quit to menu"). */
  toMenu() {
    this.startMatch(this.difficulty);
    this.events.length = 0;
    this.phase = 'menu';
    this.countdownLabel = '';
    this.timeLeft = ROUND_TIME;
  }

  /** Advance the simulation by `dt` seconds (call with STEP). Returns the events produced. */
  update(dt, in1 = NEUTRAL, in2 = null) {
    if (this.phase !== 'menu' && this.phase !== 'matchEnd') this.time += dt;
    switch (this.phase) {
      case 'countdown': {
        this.phaseT += dt;
        const n = 3 - Math.floor(this.phaseT / COUNTDOWN_STEP);
        if (n >= 1 && n !== this._lastCount) {
          this._lastCount = n;
          this.countdownLabel = String(n);
          this.emit({ type: 'countdown', n });
        }
        for (const f of this.fighters) this.stepFighter(f, this.other(f), NEUTRAL, dt);
        if (this.phaseT >= FIGHT_AT) {
          this.phase = 'fight';
          this.phaseT = 0;
          this.countdownLabel = 'FIGHT!';
          this.emit({ type: 'fightStart' });
        }
        break;
      }
      case 'fight': {
        if (this.cinematic) {
          this.cinematic.t -= dt;
          if (this.cinematic.t <= 0) this.cinematic = null;
          break;
        }
        this.phaseT += dt;
        if (this.phaseT > 0.9) this.countdownLabel = '';
        this.simulate(dt, in1, in2);
        if (this.phase === 'fight') {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          if (this.timeLeft <= 0) this.timeUp();
        }
        break;
      }
      case 'ko': {
        this.phaseT += dt;
        if (this.phaseT > KO_SLOWMO) this.timeScale = 1;
        const sdt = dt * this.timeScale;
        for (const f of this.fighters) this.stepFighter(f, this.other(f), NEUTRAL, sdt);
        this.pushApart();
        if (this.phaseT >= KO_TOTAL) {
          if (this.matchWinner) {
            this.phase = 'matchEnd';
            this.emit({ type: 'matchEnd', winner: this.matchWinner });
          } else {
            this.round += 1;
            this.beginRound();
          }
        }
        break;
      }
      default:
        break; // menu / matchEnd: frozen
    }
    return this.events.splice(0);
  }

  other(f) {
    return f === this.p1 ? this.p2 : this.p1;
  }

  byId(id) {
    return id === 'p1' ? this.p1 : this.p2;
  }

  // ---- round flow ---------------------------------------------------------

  beginRound() {
    for (const f of this.fighters) {
      const w = f.wins;
      Object.assign(f, makeFighter(f.id, f.name, f.baseX));
      f.wins = w;
    }
    this.projectiles.length = 0;
    this.timeLeft = ROUND_TIME;
    this.timeScale = 1;
    this.cinematic = null;
    this.roundResult = null;
    this.phase = 'countdown';
    this.phaseT = 0;
    this._lastCount = 0;
    this.countdownLabel = '3';
    this.emit({ type: 'roundStart', round: this.round });
    this.emit({ type: 'countdown', n: 3 });
    this._lastCount = 3;
  }

  timeUp() {
    this.emit({ type: 'timeUp' });
    const a = this.p1.hp;
    const b = this.p2.hp;
    this.endRound(a === b ? null : a > b ? this.p1 : this.p2, 'time');
  }

  knockOut(winner, loser) {
    if (this.phase !== 'fight' || loser.ko) return;
    loser.ko = true;
    loser.hp = 0;
    loser.attack = null;
    loser.blocking = false;
    loser.stun = 0;
    loser.vx = -loser.facing * 4;
    loser.vy = 3.6;
    loser.grounded = false;
    this.emit({ type: 'ko', id: loser.id, x: loser.x, y: loser.y + 1 });
    this.endRound(winner, 'ko');
  }

  endRound(winner, reason) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko';
    this.phaseT = 0;
    this.timeScale = reason === 'ko' ? 0.3 : 1;
    this.projectiles.length = 0;
    for (const f of this.fighters) {
      f.attack = null; // nothing may land once the round is decided
      f.blocking = false;
      if (f.domain.active) {
        f.domain.active = false;
        this.emit({ type: 'domainEnd', id: f.id });
      }
    }
    if (winner) winner.wins += 1;
    else {
      this.p1.wins += 1;
      this.p2.wins += 1;
    }
    const w1 = this.p1.wins >= ROUNDS_TO_WIN;
    const w2 = this.p2.wins >= ROUNDS_TO_WIN;
    this.matchWinner = w1 && w2 ? 'draw' : w1 ? 'p1' : w2 ? 'p2' : null;
    this.roundResult = { winner: winner ? winner.id : null, reason };
    this.emit({
      type: 'roundEnd', winner: this.roundResult.winner, reason,
      wins: { p1: this.p1.wins, p2: this.p2.wins }, matchWinner: this.matchWinner,
    });
  }

  // ---- simulation ---------------------------------------------------------

  simulate(dt, in1, in2) {
    const i2 = in2 || this.aiInput(this.p2, this.p1, dt);
    this.stepFighter(this.p1, this.p2, in1, dt);
    this.stepFighter(this.p2, this.p1, i2, dt);
    this.stepProjectiles(dt);
    for (const f of this.fighters) this.stepDomain(f, dt);
    this.pushApart();
  }

  pushApart() {
    const { p1, p2 } = this;
    const gap = p2.x - p1.x;
    if (Math.abs(gap) < MIN_GAP && Math.abs(p1.y - p2.y) < 0.9) {
      const push = (MIN_GAP - Math.abs(gap)) / 2;
      const s = Math.sign(gap) || 1;
      p1.x = clamp(p1.x - s * push, -ARENA_HALF, ARENA_HALF);
      p2.x = clamp(p2.x + s * push, -ARENA_HALF, ARENA_HALF);
    }
  }

  stepDomain(f, dt) {
    const d = f.domain;
    if (d.cd > 0) d.cd -= dt;
    if (!d.active) return;
    d.t -= dt;
    d.tick -= dt;
    const o = this.other(f);
    if (d.tick <= 0 && !o.ko) {
      d.tick += DOMAIN_TICK;
      // "Sure-hit": the domain always lands a little damage, can't be blocked or dodged.
      o.hp = Math.max(0, o.hp - DOMAIN_TICK_DAMAGE);
      o.flash = 0.08;
      this.emit({ type: 'domainTick', target: o.id, damage: DOMAIN_TICK_DAMAGE, x: o.x, y: o.y + 1 });
      if (o.hp <= 0) this.knockOut(f, o);
    }
    if (d.t <= 0 && d.active) {
      d.active = false;
      this.emit({ type: 'domainEnd', id: f.id });
    }
  }

  stepFighter(f, o, input, dt) {
    if (f.hitstop > 0) {
      f.hitstop -= dt;
      return;
    }
    f.flash = Math.max(0, f.flash - dt);
    f.stun = Math.max(0, f.stun - dt);
    f.blockstun = Math.max(0, f.blockstun - dt);
    f.invuln = Math.max(0, f.invuln - dt);
    f.dodgeCd = Math.max(0, f.dodgeCd - dt);
    f.specialCd = Math.max(0, f.specialCd - dt);

    // Combo bookkeeping: the combo ends shortly after the victim recovers.
    if (f.combo > 0) {
      if (o.stun > 0 || o.blockstun > 0) f.comboGrace = 0.3;
      else {
        f.comboGrace -= dt;
        if (f.comboGrace <= 0) f.combo = 0;
      }
    }

    if (f.ko) {
      this.integrate(f, dt, true);
      f.state = 'ko';
      return;
    }

    if (f.grounded && !f.attack && f.dodgeT <= 0) {
      const dir = Math.sign(o.x - f.x);
      if (dir) f.facing = dir;
    }

    // Input buffer: an action pressed slightly too early still comes out.
    for (const a of input.actions) {
      f.buf = a;
      f.bufT = BUFFER_TIME;
    }
    if (f.bufT > 0) {
      f.bufT -= dt;
      if (f.bufT <= 0) f.buf = null;
    }

    f.dodgeMove = input.move || 0; // dodge goes the way you're holding, else backwards
    const free = f.stun <= 0 && f.blockstun <= 0 && f.dodgeT <= 0;
    if (f.buf && free && this.tryAction(f, o, f.buf)) {
      f.buf = null;
      f.bufT = 0;
    }

    // Attack progression
    if (f.attack) {
      const a = ATTACKS[f.attack.type];
      f.attack.t += dt;
      if (a.projectile) {
        if (!f.attack.spawned && f.attack.t >= a.startup) {
          f.attack.spawned = true;
          this.spawnProjectile(f, a);
        }
      } else if (!f.attack.hit && f.attack.t >= a.startup && f.attack.t < a.startup + a.active) {
        this.tryMelee(f, o, a);
      }
      // A KO inside tryMelee clears f.attack (see endRound), so re-check before using it.
      if (f.attack && f.attack.t >= a.total) f.attack = null;
    }

    f.blocking = !!input.block && f.grounded && f.stun <= 0 && f.dodgeT <= 0 && !f.attack;

    // Horizontal movement
    const canWalk = f.stun <= 0 && f.blockstun <= 0 && f.dodgeT <= 0 && !f.attack && !f.blocking;
    if (f.dodgeT > 0) {
      f.dodgeT -= dt;
      f.vx = f.dodgeDir * DODGE_SPEED;
    } else if (canWalk) {
      const slow = o.domain.active ? 0.7 : 1;
      const target = (input.move || 0) * (input.sprint ? SPRINT : WALK) * slow;
      f.vx += (target - f.vx) * Math.min(1, dt * (f.grounded ? 14 : 5));
    } else {
      f.vx -= f.vx * Math.min(1, dt * (f.grounded ? 9 : 1.5));
    }

    this.integrate(f, dt, false);

    f.state = f.ko ? 'ko'
      : f.stun > 0 ? 'hit'
      : f.attack ? 'attack'
      : f.dodgeT > 0 ? 'dodge'
      : f.blocking || f.blockstun > 0 ? 'block'
      : !f.grounded ? 'air'
      : Math.abs(f.vx) > 0.5 ? 'run'
      : 'idle';
  }

  integrate(f, dt, dead) {
    if (!f.grounded) {
      const wasFalling = f.vy;
      f.vy -= GRAVITY * dt;
      f.y += f.vy * dt;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        f.grounded = true;
        if (wasFalling < -4 && !dead) this.emit({ type: 'land', id: f.id, x: f.x });
      }
    }
    if (dead) f.vx -= f.vx * Math.min(1, dt * (f.grounded ? 6 : 0.5));
    f.x += f.vx * dt;
    if (f.x > ARENA_HALF || f.x < -ARENA_HALF) {
      f.x = clamp(f.x, -ARENA_HALF, ARENA_HALF);
      f.vx = 0;
    }
  }

  tryAction(f, o, a) {
    if (a === 'jump') {
      if (f.attack || !f.grounded) return false;
      f.vy = JUMP_V;
      f.grounded = false;
      this.emit({ type: 'jump', id: f.id, x: f.x });
      return true;
    }
    if (a === 'light' || a === 'heavy' || a === 'special') {
      if (a === 'special' && f.specialCd > 0) return false;
      if (f.attack) {
        // Cancel a connected attack's recovery into the next one (combos).
        const cur = ATTACKS[f.attack.type];
        const inRecovery = f.attack.t >= cur.startup + cur.active;
        const ok = f.attack.hit && inRecovery && f.attack.chain < 4 && (a !== f.attack.type || a === 'light');
        if (!ok) return false;
        this.startAttack(f, a, f.attack.chain + 1);
        return true;
      }
      if (!f.grounded && a !== 'special') return false;
      this.startAttack(f, a, 0);
      return true;
    }
    if (a === 'dodge') {
      if (f.attack || f.dodgeCd > 0 || !f.grounded) return false;
      f.dodgeT = DODGE_TIME;
      f.invuln = DODGE_INVULN;
      f.dodgeCd = DODGE_CD;
      f.dodgeDir = f.dodgeMove || -f.facing;
      this.emit({ type: 'dodge', id: f.id, x: f.x, y: f.y + 1 });
      return true;
    }
    if (a === 'domain') {
      if (f.attack || f.energy < 100 || f.domain.active || f.domain.cd > 0) return false;
      this.activateDomain(f, o);
      return true;
    }
    return false;
  }

  startAttack(f, type, chain) {
    const a = ATTACKS[type];
    f.attack = { type, t: 0, hit: false, spawned: false, chain };
    f.blocking = false;
    if (type === 'special') f.specialCd = a.cooldown;
    if (a.lunge) f.vx += f.facing * a.lunge;
    this.emit({ type: 'swing', id: f.id, attack: type, x: f.x });
  }

  tryMelee(f, o, a) {
    const dx = (o.x - f.x) * f.facing; // how far in front of the attacker the target is
    if (dx < -0.15 || dx > a.range + 0.35) return;
    if (Math.abs(o.y - f.y) > 1.15) return;
    this.resolveHit(f, o, f.attack.type, a, null);
  }

  spawnProjectile(f, a) {
    const p = {
      id: this._projId++, owner: f.id,
      x: f.x + f.facing * 0.8, y: f.y + 1.0,
      vx: f.facing * a.speed, life: 1.6,
    };
    this.projectiles.push(p);
    this.emit({ type: 'projectile', id: f.id, x: p.x, y: p.y });
  }

  stepProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.life -= dt;
      const owner = this.byId(p.owner);
      const target = this.other(owner);
      let remove = p.life <= 0 || Math.abs(p.x) > ARENA_HALF + 1.5;
      if (!remove) {
        for (const q of this.projectiles) {
          if (q !== p && q.owner !== p.owner && Math.abs(q.x - p.x) < 0.6) {
            remove = true;
            q.life = 0;
            this.emit({ type: 'clash', x: (p.x + q.x) / 2, y: p.y });
            break;
          }
        }
      }
      if (!remove && !target.ko && target.invuln <= 0 &&
          Math.abs(p.x - target.x) < 0.6 && Math.abs(target.y + 1 - p.y) < 1.1) {
        remove = this.resolveHit(owner, target, 'special', ATTACKS.special, p);
      }
      if (remove) this.projectiles.splice(i, 1);
    }
  }

  addEnergy(f, n) {
    if (this.other(f).domain.active) return; // the domain's victim can't charge
    f.energy = Math.min(100, f.energy + n);
  }

  /** Apply a hit/block. Returns false if it whiffed (e.g. the target was dodging). */
  resolveHit(f, o, type, a, proj) {
    if (o.ko || o.invuln > 0) return false;
    const dirAway = Math.sign(o.x - f.x) || f.facing;
    const attackerInFront = (f.x - o.x) * o.facing > -0.2;
    const blocked = o.blocking && o.grounded && o.stun <= 0 && attackerInFront;
    const scale = Math.max(0.5, 1 - 0.1 * f.combo);
    let dmg = a.damage * (f.domain.active ? 1.3 : 1) * scale;
    const px = proj ? proj.x : o.x - dirAway * 0.35;
    const py = proj ? proj.y : o.y + 1;
    if (!proj && f.attack) f.attack.hit = true;

    if (blocked) {
      dmg = Math.max(0.5, Math.round(dmg * a.chip * 10) / 10);
      o.hp = Math.max(1, o.hp - dmg); // chip damage can't kill
      o.blockstun = a.blockstun;
      o.vx = dirAway * a.blockPush;
      if (!proj) f.vx -= dirAway * 1.0;
      this.addEnergy(f, a.gain * 0.4);
      this.addEnergy(o, 3);
      o.hitstop = f.hitstop = a.hitstop * 0.6;
      this.emit({ type: 'block', target: o.id, attacker: f.id, attack: type, damage: dmg, x: px, y: py });
      return true;
    }

    o.hp = Math.max(0, o.hp - dmg);
    f.combo += 1;
    f.comboGrace = 0.3;
    o.stun = a.hitstun * Math.max(0.55, 1 - 0.08 * (f.combo - 1));
    o.attack = null;
    o.blocking = false;
    o.buf = null;
    o.vx = dirAway * a.knock;
    if (a.launch || !o.grounded) {
      o.vy = a.launch || 2.2;
      o.grounded = false;
    }
    o.flash = 0.16;
    o.hitstop = f.hitstop = a.hitstop;
    this.addEnergy(f, a.gain);
    this.addEnergy(o, 6);
    this.emit({
      type: 'hit', target: o.id, attacker: f.id, attack: type, damage: dmg,
      combo: f.combo, x: px, y: py, dir: dirAway, projectile: !!proj,
    });
    if (o.hp <= 0) this.knockOut(f, o);
    return true;
  }

  activateDomain(f, o) {
    f.energy = 0;
    f.domain.active = true;
    f.domain.t = DOMAIN_TIME;
    f.domain.cd = DOMAIN_CD;
    f.domain.tick = 0.6;
    if (o.domain.active) {
      o.domain.active = false;
      this.emit({ type: 'domainEnd', id: o.id, clashed: true });
      this.emit({ type: 'clash', x: 0, y: 2 });
    }
    this.cinematic = { owner: f.id, t: DOMAIN_CAST };
    this.emit({ type: 'domainStart', id: f.id, name: DOMAIN_NAMES[f.id] });
  }

  emit(e) {
    this.events.push(e);
  }

  // ---- AI -----------------------------------------------------------------

  aiInput(f, o, dt) {
    const ai = f.ai;
    const L = AI_LEVELS[this.difficulty];
    const dist = o.x - f.x;
    const ad = Math.abs(dist);
    const dir = Math.sign(dist) || f.facing;
    const input = { move: 0, block: false, sprint: false, actions: [] };
    if (f.ko || f.stun > 0) return input;

    ai.t -= dt;
    ai.modeT -= dt;

    if (ai.t <= 0) {
      // Decisions are made at a human-like reaction interval, not every frame.
      ai.t = L.react * (0.6 + this.rng() * 0.8);
      const oa = o.attack ? ATTACKS[o.attack.type] : null;
      const meleeIncoming = !!oa && !oa.projectile && ad < oa.range + 0.9;
      const shotIncoming = this.projectiles.some(
        (p) => p.owner !== f.id && Math.abs(p.x - f.x) < 3.2 && Math.sign(f.x - p.x) === Math.sign(p.vx),
      );
      const threat = meleeIncoming || shotIncoming;
      const r = this.rng();
      if (threat && r < L.block) {
        ai.mode = 'block';
        ai.modeT = 0.35 + this.rng() * 0.25;
      } else if (threat && r < L.block + L.dodge && f.dodgeCd <= 0) {
        ai.mode = 'idle';
        ai.modeT = 0.1;
        input.actions.push('dodge'); // no move input => dodges backwards, away from the player
      } else if (ai.mode === 'block' && ai.modeT > 0) {
        // keep guarding
      } else if (f.energy >= 100 && !f.domain.active && f.domain.cd <= 0 && r < 0.6) {
        input.actions.push('domain');
        ai.mode = 'idle';
      } else if (
        oa && !oa.projectile && o.attack.t >= oa.startup + oa.active && ad <= L.spacing + 0.35 && this.rng() < L.punish
      ) {
        // The opponent just swung and is stuck in recovery: punish it.
        input.actions.push(this.rng() < 0.5 ? 'heavy' : 'light');
        ai.mode = 'idle';
        ai.t = Math.min(ai.t, 0.12);
      } else if (ad > 3.4 && f.specialCd <= 0 && r < 0.4 * L.aggr) {
        input.actions.push('special');
        ai.mode = 'idle';
        ai.modeT = 0.2;
      } else if (ad > L.spacing) {
        ai.mode = 'approach';
        ai.modeT = 0.25 + this.rng() * 0.3;
      } else if (r < L.aggr) {
        input.actions.push(this.rng() < 0.65 ? 'light' : 'heavy');
        ai.mode = 'idle';
        ai.t = Math.min(ai.t, 0.12); // re-decide quickly so combos can chain
      } else {
        ai.mode = 'retreat';
        ai.modeT = 0.3 + this.rng() * 0.25;
      }
    }

    if (ai.modeT > 0) {
      if (ai.mode === 'approach') {
        input.move = dir;
        input.sprint = ad > 4.5;
      } else if (ai.mode === 'retreat') input.move = -dir;
      else if (ai.mode === 'block') input.block = true;
    } else if (ai.mode !== 'idle') {
      ai.mode = 'idle';
    }
    return input;
  }
}
