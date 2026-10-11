import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10152f);
scene.fog = new THREE.Fog(0x10152f, 16, 38);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7.4, 13.5);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xa9d6ff, 0x342044, 2.0));
const key = new THREE.DirectionalLight(0xffe7ce, 3.1);
key.position.set(-5, 10, 7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.PointLight(0x8c70ff, 45, 25);
rim.position.set(4, 4, -5);
scene.add(rim);
const blueLight = new THREE.PointLight(0x25dfff, 28, 20);
blueLight.position.set(-5, 3, 1);
scene.add(blueLight);

const mat = (color, roughness = 0.55, metalness = 0, emissive = 0x000000) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: 0.6 });
const floorMat = mat(0x24284d, 0.8);
const floor = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.35, 64), floorMat);
floor.position.y = -0.35;
floor.receiveShadow = true;
scene.add(floor);
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(6.7, 0.035, 8, 100),
  new THREE.MeshBasicMaterial({ color: 0x7c8dff })
);
ring.rotation.x = Math.PI / 2;
ring.position.y = -0.15;
scene.add(ring);
for (let i = 0; i < 32; i++) {
  const a = (i / 32) * Math.PI * 2;
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.8), mat(i % 2 ? 0x3b427a : 0x6853a8));
  p.position.set(Math.cos(a) * 7.3, -0.12, Math.sin(a) * 7.3);
  p.rotation.y = -a;
  scene.add(p);
}

const crystals = [];

for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const h = 1.3 + (i % 3) * 0.65;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 6), mat(i % 2 ? 0x454b80 : 0x3b326c));
  pillar.position.set(Math.cos(a) * 8.8, h / 2 - 0.1, Math.sin(a) * 8.8);
  pillar.castShadow = true;
  scene.add(pillar);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32),
    new THREE.MeshStandardMaterial({
      color: i % 2 ? 0x73efff : 0xc38bff,
      emissive: i % 2 ? 0x28cfff : 0x8e3bff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    })
  );
  crystal.position.set(pillar.position.x, h + 0.15, pillar.position.z);
  crystal.userData.spin = (i % 2 ? 1 : -1) * 0.7;
  scene.add(crystal);
  crystals.push(crystal);
}

function makeChicken({ x, color, comb, aura, dark = false }) {
  const root = new THREE.Group();
  root.position.set(x, 0, 0);
  scene.add(root);

  const body = new THREE.Group();
  body.position.y = 1.0;
  root.add(body);

  const bodyMat = mat(color, 0.68);
  const combMat = mat(comb, 0.45);
  const beakMat = mat(0xffa33e);
  const footMat = mat(0xff8b38);
  const eyeWhite = mat(0xffffff, 0.25);
  const pupilMat = mat(dark ? 0xd9baff : 0x17203e, 0.2, 0, dark ? 0x702cff : 0x000000);

  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 18), bodyMat);
  bodyMesh.scale.set(0.82, 1.02, 0.72);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 16), mat(dark ? 0x343052 : 0xfff2d9));
  belly.scale.set(0.9, 0.82, 0.42);
  belly.position.set(0, -0.17, 0.48);
  body.add(belly);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.58, 0.05);
  body.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.53, 24, 18), bodyMat);
  head.scale.set(1.03, 0.92, 0.9);
  head.castShadow = true;
  headPivot.add(head);

  for (let j = 0; j < 3; j++) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), combMat);
    lobe.scale.set(0.9, 1.25, 0.7);
    lobe.position.set((j - 1) * 0.22, 0.47 - Math.abs(j - 1) * 0.08, 0.03);
    lobe.rotation.z = (1 - j) * -0.15;
    headPivot.add(lobe);
  }

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.31, 5), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.08, 0.51);
  headPivot.add(beak);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), eyeWhite);
    eye.position.set(s * 0.22, 0.08, 0.44);
    headPivot.add(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), pupilMat);
    pupil.position.set(s * 0.22, 0.075, 0.55);
    headPivot.add(pupil);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.055, 0.07), combMat);
    brow.position.set(s * 0.22, 0.26, 0.46);
    brow.rotation.z = s * -0.16;
    headPivot.add(brow);

    const wing = new THREE.Group();
    wing.position.set(s * 0.55, -0.08, 0.02);
    body.add(wing);
    const wm = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), mat(dark ? 0x3c315d : 0xf5f8ff));
    wm.scale.set(0.55, 0.95, 0.5);
    wm.rotation.z = s * -0.45;
    wing.add(wm);
    wing.userData.side = s;
    root.userData.wings ??= [];
    root.userData.wings.push(wing);

    const leg = new THREE.Group();
    leg.position.set(s * 0.25, -0.65, 0.02);
    body.add(leg);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.33, 8), footMat);
    upper.position.y = -0.12;
    leg.add(upper);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), footMat);
    foot.scale.set(1, 0.45, 1.4);
    foot.position.set(0, -0.29, 0.1);
    leg.add(foot);
    leg.userData.side = s;
    root.userData.legs ??= [];
    root.userData.legs.push(leg);
  }

  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), combMat);
    f.scale.set(0.7, 1.8, 0.65);
    f.position.set((i - 1) * 0.16, -0.04, -0.62);
    f.rotation.x = -0.55;
    f.rotation.z = (i - 1) * 0.35;
    body.add(f);
  }

  const auraMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.02, 24, 18),
    new THREE.MeshBasicMaterial({ color: aura, transparent: true, opacity: 0.13, wireframe: true })
  );
  auraMesh.position.y = 1.05;
  root.add(auraMesh);

  root.userData = {
    ...root.userData,
    body,
    headPivot,
    auraMesh,
    baseX: x,
    velX: 0,
    velY: 0,
    hp: 100,
    energy: 0,
    face: x < 0 ? 1 : -1,
    attack: 0,
    attackType: '',
    cooldown: 0,
    invuln: 0,
    stun: 0,
    domain: 0,
    domainTime: 0,
    domainCooldown: 0,
    ai: x > 0,
    grounded: true,
  };

  return root;
}

const p1 = makeChicken({ x: -2.5, color: 0xfff8ee, comb: 0xff4e69, aura: 0x4beaff });
const p2 = makeChicken({ x: 2.5, color: 0x28233e, comb: 0xb54cff, aura: 0x9b35ff, dark: true });

function addFeatherBurst(pos, color, count = 18) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.08),
      new THREE.MeshBasicMaterial({ color, transparent: true })
    );
    m.position.copy(pos);
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 3;
    m.userData = {
      vx: Math.cos(a) * s,
      vy: Math.random() * 4,
      vz: Math.sin(a) * s,
      life: 0.5 + Math.random() * 0.6,
    };
    particles.push(m);
  }
}

const particles = [];

function makeSlash(x, z, color) {
  const group = new THREE.Group();
  const geo = new THREE.TorusGeometry(0.6, 0.055, 6, 30, Math.PI * 1.2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  group.add(mesh);
  group.position.set(x, 1.2, z);
  group.rotation.y = Math.PI / 2;
  scene.add(group);
  slashes.push({ group, life: 0.24 });
}

const slashes = [];
const keys = new Set();
let running = false;
let domainFlash = 0;
let gameTime = 99;
let roundOver = false;

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'q' && running) activateDomain(p1);
  if (e.key.toLowerCase() === 'j' && running) attack(p1, 'light');
  if (e.key.toLowerCase() === 'k' && running) attack(p1, 'heavy');
  if (e.key.toLowerCase() === 'l' && running) attack(p1, 'special');
  if (e.code === 'Space' && running) dodge(p1);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function attack(f, type) {
  if (f.userData.cooldown > 0 || f.userData.stun > 0 || f.userData.domainTime > 0) return;
  const d = f.userData;
  d.attack = type === 'light' ? 0.22 : type === 'heavy' ? 0.42 : 0.5;
  d.attackType = type;
  d.cooldown = type === 'light' ? 0.32 : type === 'heavy' ? 0.65 : 1.05;
  d.energy = Math.min(100, d.energy + (type === 'special' ? 5 : 9));
  f.userData.body.rotation.z = type === 'heavy' ? -0.25 : -0.12;

  const opponent = f === p1 ? p2 : p1;
  const dist = Math.abs(f.position.x - opponent.position.x);
  if (
    dist < (type === 'light' ? 1.55 : type === 'heavy' ? 2.05 : 4.2) &&
    Math.abs(f.position.z - opponent.position.z) < 1.7 &&
    opponent.userData.invuln <= 0
  ) {
    const od = opponent.userData;
    const damage = type === 'light' ? 7 : type === 'heavy' ? 13 : 17;
    od.hp = Math.max(0, od.hp - damage);
    od.stun = type === 'heavy' ? 0.24 : 0.12;
    od.velX = Math.sign(opponent.position.x - f.position.x) * (type === 'heavy' ? 5 : 2.5);
    od.velY = type === 'heavy' ? 2.4 : 0.7;
    od.energy = Math.min(100, od.energy + 6);
    addFeatherBurst(
      opponent.position.clone().add(new THREE.Vector3(0, 1, 0)),
      type === 'special' ? 0xb56aff : 0x79eaff,
      22
    );
    makeSlash((f.position.x + opponent.position.x) / 2, 0, type === 'special' ? 0xbb61ff : 0x79eaff);
    if (od.hp <= 0) finish(f === p1 ? 'SUNNY PECK WINS!' : 'SHADOW CLUCK WINS!');
  }
}

function dodge(f) {
  const d = f.userData;
  if (d.cooldown > 0 || d.stun > 0) return;
  d.invuln = 0.28;
  d.cooldown = 0.55;
  d.velX = (f === p1 ? 1 : -1) * (keys.has('a') ? -1 : 1) * 5;
  addFeatherBurst(f.position.clone().add(new THREE.Vector3(0, 1, 0)), f === p1 ? 0x75efff : 0xb25aff, 8);
}

function activateDomain(f) {
  const d = f.userData;
  if (d.energy < 100 || d.domainCooldown > 0 || roundOver) return;
  d.energy = 0;
  d.domainTime = 8;
  d.domainCooldown = 14;
  domainFlash = 1.6;
  scene.background = new THREE.Color(f === p1 ? 0x172e66 : 0x260d46);
  scene.fog.color.copy(scene.background);
  document.querySelector('#banner').textContent =
    f === p1 ? 'DOMAIN: GOLDEN COOP OF INFINITY' : 'DOMAIN: ETERNAL NEST OF SHADOWS';
  addFeatherBurst(f.position.clone().add(new THREE.Vector3(0, 1, 0)), f === p1 ? 0x6eeaff : 0xc14bff, 65);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(7, 32, 20),
    new THREE.MeshBasicMaterial({
      color: f === p1 ? 0x52dfff : 0x9c36ff,
      wireframe: true,
      transparent: true,
      opacity: 0.17,
      side: THREE.DoubleSide,
    })
  );
  dome.position.set(f.position.x, 2, 0);
  scene.add(dome);
  setTimeout(() => scene.remove(dome), 1800);
}

function finish(msg) {
  roundOver = true;
  document.querySelector('#banner').textContent = msg;
  document.querySelector('#status').textContent = 'ROUND OVER';
}

function reset() {
  for (const f of [p1, p2]) {
    const d = f.userData;
    f.position.set(d.baseX, 0, 0);
    d.hp = 100;
    d.energy = 0;
    d.velX = 0;
    d.velY = 0;
    d.cooldown = 0;
    d.stun = 0;
    d.invuln = 0;
    d.domainTime = 0;
    d.domainCooldown = 0;
    d.attack = 0;
  }
  gameTime = 99;
  roundOver = false;
  running = true;
  scene.background.set(0x10152f);
  scene.fog.color.set(0x10152f);
  document.querySelector('#banner').textContent = 'CUTE CHICKENS. DEADLY DOMAINS.';
  document.querySelector('#status').textContent = 'FIGHT IN PROGRESS';
  document.querySelector('#overlay').classList.add('hidden');
}

document.querySelector('#start').addEventListener('click', reset);
document.querySelector('#restart').addEventListener('click', reset);

function moveFighter(f, dt, isPlayer) {
  const d = f.userData;
  const op = f === p1 ? p2 : p1;
  let move = 0;

  if (isPlayer) {
    if (keys.has('a')) move -= 1;
    if (keys.has('d')) move += 1;
    if (keys.has('w') && d.grounded !== false) {
      d.velY = 6.8;
      d.grounded = false;
    }
  } else {
    const dx = op.position.x - f.position.x;
    if (Math.abs(dx) > 1.25) move = Math.sign(dx);
    if (Math.abs(dx) < 2.0 && Math.random() < dt * 1.8) attack(f, Math.random() < 0.7 ? 'light' : 'heavy');
    if (Math.abs(dx) > 3 && Math.random() < dt * 0.3 && d.energy >= 100) activateDomain(f);
  }

  if (d.stun > 0) move = 0;

  const target = move * (keys.has('shift') && isPlayer ? 5.7 : 3.6);
  d.velX += (target - d.velX) * Math.min(1, dt * (move ? 12 : 7));
  f.position.x += d.velX * dt;
  f.position.x = THREE.MathUtils.clamp(f.position.x, -6.1, 6.1);

  if (d.velY !== undefined) {
    d.velY -= 16 * dt;
    f.position.y += d.velY * dt;
    if (f.position.y <= 0) {
      f.position.y = 0;
      d.velY = 0;
      d.grounded = true;
    }
  }

  f.position.z = 0;
  d.face = op.position.x >= f.position.x ? 1 : -1;
  f.rotation.y = d.face === 1 ? 0 : Math.PI;

  if (d.cooldown > 0) d.cooldown = Math.max(0, d.cooldown - dt);
  if (d.invuln > 0) d.invuln -= dt;
  if (d.stun > 0) d.stun -= dt;

  if (d.attack > 0) {
    d.attack -= dt;
    const attackOffset = d.attackType === 'heavy' ? 0.42 : 0.22;
    d.body.rotation.z = Math.sin((attackOffset - d.attack) * 15) * 0.16;
    d.body.position.y = 1 + Math.sin(performance.now() * 0.018) * 0.025;
  } else {
    d.body.rotation.z += (0 - d.body.rotation.z) * dt * 9;
    d.body.position.y = 1 + Math.sin(performance.now() * 0.0025 + (isPlayer ? 0 : 1)) * 0.045;
  }

  if (d.domainTime > 0) {
    d.domainTime -= dt;
    d.energy = Math.min(100, d.energy + dt * 4);
    if (d.domainTime <= 0) {
      scene.background.set(0x10152f);
      scene.fog.color.set(0x10152f);
      document.querySelector('#banner').textContent = 'CUTE CHICKENS. DEADLY DOMAINS.';
    }
  }
  if (d.domainCooldown > 0) d.domainCooldown -= dt;

  d.wings?.forEach((w) => {
    w.rotation.z = w.userData.side * (move ? -0.35 : Math.sin(performance.now() * 0.004) * 0.08) + (d.attack > 0 ? -0.7 : 0);
  });
  d.legs?.forEach((l) => {
    l.rotation.x = move ? Math.sin(performance.now() * 0.012 + l.userData.side) * 0.45 : 0;
  });

  d.auraMesh.material.opacity = 0.1 + d.energy / 450 + (d.domainTime > 0 ? 0.25 : 0);
  d.auraMesh.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.035 + d.energy / 500);
}

let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

function update(dt) {
  if (!running) return;
  gameTime -= dt;
  if (gameTime <= 0) {
    gameTime = 0;
    finish(p1.userData.hp >= p2.userData.hp ? 'SUNNY PECK WINS!' : 'SHADOW CLUCK WINS!');
  }

  moveFighter(p1, dt, true);
  moveFighter(p2, dt, false);

  if (Math.abs(p1.position.x - p2.position.x) < 0.85) {
    const sign = Math.sign(p2.position.x - p1.position.x) || 1;
    p1.position.x -= sign * 0.018;
    p2.position.x += sign * 0.018;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const u = p.userData;
    u.life -= dt;
    p.position.x += u.vx * dt;
    p.position.y += u.vy * dt;
    u.vy -= 5 * dt;
    p.position.z += u.vz * dt;
    p.material.opacity = Math.max(0, u.life);
    p.rotation.x += dt * 4;
    if (u.life <= 0) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      particles.splice(i, 1);
    }
  }

  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i];
    s.life -= dt;
    s.group.scale.multiplyScalar(1 + dt * 4);
    s.group.children[0].material.opacity = Math.max(0, s.life / 0.24);
    if (s.life <= 0) {
      scene.remove(s.group);
      s.group.children[0].geometry.dispose();
      s.group.children[0].material.dispose();
      slashes.splice(i, 1);
    }
  }

  document.querySelector('#p1hp').style.width = p1.userData.hp + '%';
  document.querySelector('#p2hp').style.width = p2.userData.hp + '%';
  document.querySelector('#p1label').textContent = `${p1.userData.hp} / 100 HP · ${Math.round(p1.userData.energy)}% DOMAIN`;
  document.querySelector('#p2label').textContent = `${p2.userData.hp} / 100 HP · ${Math.round(p2.userData.energy)}% DOMAIN`;
  document.querySelector('#timer').textContent = Math.ceil(gameTime);
}

function animate(now) {
  requestAnimationFrame(animate);
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  acc += dt;

  if (running) {
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
  } else {
    p1.userData.body.position.y = 1 + Math.sin(now * 0.002) * 0.05;
    p2.userData.body.position.y = 1 + Math.sin(now * 0.002 + 1) * 0.05;
  }

  crystals.forEach((c) => {
    c.rotation.y += dt * c.userData.spin;
    c.rotation.x += dt * 0.3;
  });

  const mid = (p1.position.x + p2.position.x) / 2;
  camera.position.x += (mid - camera.position.x) * Math.min(1, dt * 2.5);
  camera.position.y += ((Math.abs(p1.position.x - p2.position.x) > 5 ? 8.5 : 7.4) - camera.position.y) * dt * 2;
  camera.lookAt(mid, 0.9, 0);
  renderer.render(scene, camera);
}

animate(performance.now());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
});
