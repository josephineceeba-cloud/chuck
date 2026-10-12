// Keyboard + touch input. Held controls (move/block/sprint) are polled; one-shot
// actions (jump/attacks/dodge/domain) are queued so a quick tap is never lost
// between simulation steps.

const HELD = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyS: 'block', ArrowDown: 'block',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
};
const ACTIONS = {
  KeyW: 'jump', ArrowUp: 'jump',
  KeyJ: 'light', KeyK: 'heavy', KeyL: 'special',
  Space: 'dodge', KeyQ: 'domain',
};

export class Input {
  constructor() {
    this.keys = new Set(); // held via keyboard
    this.touch = new Set(); // held via on-screen buttons
    this.queue = [];
    this.enabled = false;
  }

  attach(target = window) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e));
    target.addEventListener('keyup', (e) => this.onKeyUp(e));
    target.addEventListener('blur', () => this.clear());
  }

  /** Enable only while a fight is on, so menu keys behave normally. */
  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  clear() {
    this.keys.clear();
    this.touch.clear();
    this.queue.length = 0;
  }

  onKeyDown(e) {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const held = HELD[e.code];
    const action = ACTIONS[e.code];
    if (!held && !action) return;
    e.preventDefault(); // stops Space/arrows from scrolling or re-clicking a focused button
    if (held) this.keys.add(held);
    if (action && !e.repeat) this.press(action);
  }

  onKeyUp(e) {
    const held = HELD[e.code];
    if (held) this.keys.delete(held);
  }

  press(action) {
    if (!this.enabled) return;
    this.queue.push(action);
    if (this.queue.length > 6) this.queue.shift();
  }

  hold(name, on) {
    if (on) this.touch.add(name);
    else this.touch.delete(name);
  }

  /** Snapshot for one simulation step. One-shot actions are consumed. */
  read() {
    const has = (n) => this.keys.has(n) || this.touch.has(n);
    return {
      move: (has('right') ? 1 : 0) - (has('left') ? 1 : 0),
      block: has('block'),
      sprint: has('sprint'),
      actions: this.queue.splice(0),
    };
  }
}

/** Wire up the on-screen touch buttons (elements with data-hold / data-act). */
export function bindTouchControls(root, input) {
  const release = new Set();
  root.querySelectorAll('[data-hold], [data-act]').forEach((el) => {
    const hold = el.dataset.hold;
    const act = el.dataset.act;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('down');
      if (hold) input.hold(hold, true);
      if (act) input.press(act);
    });
    const up = () => {
      el.classList.remove('down');
      if (hold) input.hold(hold, false);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    release.add(up);
  });
}
