// Three.js rendering for CLUCKED. Reads game state (game.js) and turns it into
// poses, effects and camera moves. It never changes the game state.
//
// `THREE` is passed in so main.js can load the library from a local copy or a CDN
// and so this file works with whichever one succeeded.

import { ATTACKS } from './game.js';

const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const DOMAIN_COLORS = { p1: 0x172e66, p2: 0x260d46 };
const BASE_BG = 0xf6d5b6; // morning haze at the horizon (fog and clear colour)

export function createView(THREE, mount) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BASE_BG);
  scene.fog = new THREE.Fog(BASE_BG, 24, 64);

  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 6.4, 12.5);

  // Throws if WebGL isn't available; main.js turns that into a friendly message.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  // ---- lights -------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xe0b98f, 1.7)); // blue sky, warm ground bounce
  const key = new THREE.DirectionalLight(0xffd3a1, 3.6); // low golden sun: long soft shadows
  key.position.set(-9, 6.5, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.camera.updateProjectionMatrix(); // required after changing the bounds
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.PointLight(0xffb870, 22, 25); // sunrise glow from behind
  rim.position.set(-4, 4, -6);
  scene.add(rim);
  const blueLight = new THREE.PointLight(0xa8dcff, 9, 20); // cool sky fill
  blueLight.position.set(5, 3, 3);
  scene.add(blueLight);
  const domainLight = new THREE.PointLight(0xffffff, 0, 40);
  domainLight.position.set(0, 7, 3);
  scene.add(domainLight);

  const mat = (color, roughness = 0.55, metalness = 0, emissive = 0x000000) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: 0.6 });

  // ---- arena --------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.35, 64), mat(0xcbbba8, 0.85));
  floor.position.y = -0.35;
  floor.receiveShadow = true;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.7, 0.035, 8, 100),
    new THREE.MeshBasicMaterial({ color: 0xf0a24f }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.15;
  scene.add(ring);

  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.8), mat(i % 2 ? 0xe6c79b : 0xd99a64));
    p.position.set(Math.cos(a) * 7.3, -0.12, Math.sin(a) * 7.3);
    p.rotation.y = -a;
    scene.add(p);
  }

  const crystals = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const h = 1.3 + (i % 3) * 0.65;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 6), mat(i % 2 ? 0xe3d3bd : 0xc9b194));
    pillar.position.set(Math.cos(a) * 8.8, h / 2 - 0.1, Math.sin(a) * 8.8);
    pillar.castShadow = true;
    scene.add(pillar);
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32),
      new THREE.MeshStandardMaterial({
        color: i % 2 ? 0x73efff : 0xc38bff,
        emissive: i % 2 ? 0x28cfff : 0x8e3bff,
        emissiveIntensity: 1.1,
        roughness: 0.2,
      }),
    );
    crystal.position.set(pillar.position.x, h + 0.15, pillar.position.z);
    crystal.userData.spin = (i % 2 ? 1 : -1) * 0.7;
    scene.add(crystal);
    crystals.push(crystal);
  }

  // ---- morning sky and world ----------------------------------------------
  // Everything in `fades` is dimmed while a Domain Expansion is active, so the domain's
  // own colour takes over the sky exactly as it did before.
  const fades = [];
  const fade = (m, base) => { fades.push({ m, base }); return m; };
  const clouds = [];
  {
    // Gradient sky dome: soft blue overhead, peach and gold at the horizon.
    const geo = new THREE.SphereGeometry(85, 32, 16);
    const pos = geo.attributes.position;
    const top = new THREE.Color(0x5fa8e6);
    const mid = new THREE.Color(0xa9d3f2);
    const low = new THREE.Color(0xffd9ad);
    const glow = new THREE.Color(0xffb878);
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / 85); // 0 at the horizon, 1 straight up
      if (t < 0.12) c.copy(glow).lerp(low, t / 0.12);
      else if (t < 0.45) c.copy(low).lerp(mid, (t - 0.12) / 0.33);
      else c.copy(mid).lerp(top, Math.min(1, (t - 0.45) / 0.55));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, fade(new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, transparent: true, depthWrite: false,
    }), 1));
    dome.renderOrder = -10;
    scene.add(dome);

    // The rising sun, with a wide soft halo.
    const sunPos = new THREE.Vector3(-24, 7.4, -66);
    const disc = (r, color, opacity, order) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 48),
        fade(new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity, depthWrite: false }), opacity),
      );
      m.position.copy(sunPos);
      m.lookAt(0, 6.4, 12.5);
      m.renderOrder = order;
      scene.add(m);
    };
    disc(26, 0xffc98a, 0.16, -9);
    disc(15, 0xffd9a8, 0.28, -8);
    disc(6, 0xfff1cf, 1, -7);

    // Clouds: a few puffy clusters, lit pink on the sunrise side, drifting slowly.
    const puffGeo = new THREE.SphereGeometry(1, 12, 9);
    for (let i = 0; i < 11; i++) {
      const g = new THREE.Group();
      const warm = i % 3 === 0;
      const m = fade(new THREE.MeshBasicMaterial({
        color: warm ? 0xffe3c8 : 0xffffff, fog: false, transparent: true, opacity: 0.92, depthWrite: false,
      }), 0.92);
      const n = 4 + (i % 3);
      for (let k = 0; k < n; k++) {
        const puff = new THREE.Mesh(puffGeo, m);
        const r = 2.2 + ((i * 7 + k * 3) % 5) * 0.45;
        puff.scale.set(r * 1.5, r * 0.62, r * 0.9);
        puff.position.set((k - n / 2) * 3.1, ((k * 5 + i) % 3) * 0.35, ((k * 3 + i) % 3) * 0.6);
        g.add(puff);
      }
      const a = -0.95 + (i / 10) * 1.9; // spread across the sky in front of the camera
      g.position.set(Math.sin(a) * 66, 11 + ((i * 5) % 7) * 2.6, -Math.cos(a) * 66 + 4);
      g.rotation.y = a * -1;
      g.userData.speed = 0.25 + (i % 4) * 0.12;
      g.userData.baseX = g.position.x;
      scene.add(g);
      clouds.push(g);
    }

    // Meadow around the arena plus a ring of low misty hills, so it isn't floating in a void.
    const meadow = new THREE.Mesh(
      new THREE.CircleGeometry(78, 64),
      fade(new THREE.MeshStandardMaterial({ color: 0x9cc47b, roughness: 1, transparent: true }), 1),
    );
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.55;
    meadow.receiveShadow = true;
    scene.add(meadow);
    const hillMat = fade(new THREE.MeshStandardMaterial({ color: 0x86b0a4, roughness: 1, transparent: true }), 1);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), hillMat);
      const r = 3.2 + (i % 4) * 1.5;
      hill.scale.set(r * 2.4, r * 0.5, r * 1.2);
      hill.position.set(Math.cos(a) * 66, -0.9, Math.sin(a) * 66);
      hill.rotation.y = -a;
      scene.add(hill);
    }

    // Grass tufts and wildflowers just outside the arena edge.
    const tuftGeo = new THREE.ConeGeometry(0.1, 0.5, 5);
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x78ad59, roughness: 1 });
    const flowerGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const flowerMats = [0xffffff, 0xffe066, 0xff9ec2].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
    for (let i = 0; i < 120; i++) {
      const a = (i * 2.399963) % (Math.PI * 2); // golden angle spreads them evenly
      const r = 9.6 + ((i * 37) % 100) / 100 * 11;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (i % 4 === 0) {
        const f = new THREE.Mesh(flowerGeo, flowerMats[i % 3]);
        f.position.set(x, -0.28, z);
        scene.add(f);
      } else {
        const t = new THREE.Mesh(tuftGeo, tuftMat);
        t.position.set(x, -0.3, z);
        t.rotation.set(((i * 13) % 7) * 0.03, a, ((i * 11) % 7) * 0.03);
        scene.add(t);
      }
    }
  }

  // ---- chickens -----------------------------------------------------------
  function makeChicken({ color, comb, aura, dark = false }) {
    const root = new THREE.Group();
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

    const wings = [];
    const legs = [];
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

      // Wing hangs from the shoulder so rotating the group actually flaps it.
      const wing = new THREE.Group();
      wing.position.set(s * 0.55, 0.12, 0.02);
      body.add(wing);
      const wm = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), mat(dark ? 0x3c315d : 0xf5f8ff));
      wm.scale.set(0.55, 0.95, 0.5);
      wm.position.y = -0.2;
      wm.rotation.z = s * -0.2;
      wing.add(wm);
      wing.userData.side = s;
      wings.push(wing);

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
      legs.push(leg);
    }

    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), combMat);
      f.scale.set(0.7, 1.8, 0.65);
      f.position.set((i - 1) * 0.16, -0.04, -0.62);
      f.rotation.x = -0.55;
      f.rotation.z = (i - 1) * 0.35;
      body.add(f);
    }

    const auraMat = new THREE.MeshBasicMaterial({ color: aura, transparent: true, opacity: 0.13, wireframe: true });
    const auraMesh = new THREE.Mesh(new THREE.SphereGeometry(1.02, 24, 18), auraMat);
    auraMesh.position.y = 1.05;
    root.add(auraMesh);

    // Guard bubble shown while blocking.
    const shieldMat = new THREE.MeshBasicMaterial({
      color: aura, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), shieldMat);
    shield.position.y = 1.05;
    root.add(shield);

    // Soft blob shadow on the floor (shrinks while airborne).
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    scene.add(blob);

    root.userData = {
      body, headPivot, wings, legs, bodyMat, auraMat, auraMesh, shield, shieldMat, blob, blobMat,
      yaw: 0, lean: 0, head: 0, bodyY: 1, sy: 1, sz: 1, wingOut: 0.15, legSwing: 0, tuck: 0,
      shieldPulse: 0, phase: Math.random() * 6, dark,
    };
    return root;
  }

  const c1 = makeChicken({ color: 0xfff8ee, comb: 0xff4e69, aura: 0x4beaff });
  const c2 = makeChicken({ color: 0x28233e, comb: 0xb54cff, aura: 0x9b35ff, dark: true });
  const chickens = { p1: c1, p2: c2 };
  c1.position.set(-2.5, 0, 0);
  c2.position.set(2.5, 0, 0);

  function poseChicken(ch, f, g, dt, time) {
    const u = ch.userData;
    ch.position.set(f.x, f.y, 0);

    // Face the opponent, turned slightly toward the camera for a 3/4 view.
    const yawT = (f.facing === 1 ? 1 : -1) * (Math.PI / 2 - 0.5);
    u.yaw = damp(u.yaw, yawT, 16, dt);
    ch.rotation.y = u.yaw;

    let lean = 0;
    let head = 0;
    let by = 1.0 + Math.sin(time * 2.4 + u.phase) * 0.04; // idle bob
    let sy = 1;
    let sz = 1;
    let wing = 0.18 + Math.sin(time * 2 + u.phase) * 0.06;
    let legs = 0;
    let tuck = 0;
    let k = 22; // how quickly the pose snaps to its target

    const roundOver = g.phase === 'ko' || g.phase === 'matchEnd';
    const winner = roundOver && g.roundResult && (g.roundResult.winner === f.id || (g.matchWinner === f.id));

    if (f.state === 'run') {
      const fast = Math.abs(f.vx) > 4.2;
      const run = Math.sin(time * (fast ? 22 : 15));
      legs = run * 0.8;
      lean = 0.1 * Math.sign(f.vx * f.facing || 1) * (fast ? 1.7 : 1);
      by += Math.abs(run) * 0.07;
      wing = fast ? 0.9 : 0.5;
    }
    if (!f.grounded && f.state !== 'ko') {
      tuck = 0.8;
      sy = 1 + Math.min(0.14, Math.abs(f.vy) * 0.022);
      sz = 1 / sy;
      wing = 1.1 + Math.sin(time * 30) * 0.3;
    }
    if (f.state === 'attack' && f.attack) {
      const a = ATTACKS[f.attack.type];
      const t = f.attack.t;
      const heavy = f.attack.type === 'heavy';
      const special = f.attack.type === 'special';
      k = 38;
      if (t < a.startup) {
        const p = t / a.startup; // wind-up
        lean = -(heavy ? 0.5 : 0.3) * p;
        head = -0.55 * p;
        wing = special ? 1.9 * p : 0.9 * p;
        by -= 0.07 * p;
      } else if (t < a.startup + a.active) {
        // strike / release
        lean = special ? 0.25 : heavy ? 0.7 : 0.5;
        head = special ? 0.35 : 1.0;
        wing = special ? 2.0 : 0.3;
        by -= 0.12;
        sz = 1.1;
        sy = 0.94;
      } else {
        const p = (t - a.startup - a.active) / a.recover; // recovery
        lean = (heavy ? 0.5 : 0.35) * (1 - p);
        head = 0.5 * (1 - p);
        wing = 0.5 * (1 - p) + 0.18;
      }
    }
    if (f.state === 'block') {
      by -= 0.18;
      sy = 0.9;
      lean = -0.15;
      head = 0.25;
      wing = 0.05;
    }
    if (f.state === 'hit') {
      lean = -0.55;
      head = -0.35;
      wing = 1.5;
      k = 40;
    }
    if (f.state === 'dodge') {
      lean = 0.6;
      sz = 1.25;
      sy = 0.85;
      wing = 0.9;
      by -= 0.15;
      k = 40;
    }
    if (f.state === 'ko') {
      lean = -1.5;
      head = -0.3;
      by = 0.55;
      wing = 1.2;
      k = 9;
    }
    if (g.cinematic && g.cinematic.owner === f.id) {
      wing = 2.2;
      head = -0.7;
      by += 0.2 + Math.sin(time * 14) * 0.05;
      lean = -0.15;
    }
    if (winner && f.state !== 'ko' && f.state !== 'attack') {
      by += Math.abs(Math.sin(time * 6)) * 0.4;
      wing = 1.6 + Math.sin(time * 28) * 0.4;
      head = -0.3;
    }

    u.lean = damp(u.lean, lean, k, dt);
    u.head = damp(u.head, head, k, dt);
    u.bodyY = damp(u.bodyY, by, k, dt);
    u.sy = damp(u.sy, sy, 20, dt);
    u.sz = damp(u.sz, sz, 20, dt);
    u.wingOut = damp(u.wingOut, wing, k, dt);
    u.legSwing = damp(u.legSwing, legs, 30, dt);
    u.tuck = damp(u.tuck, tuck, 18, dt);

    u.body.rotation.x = u.lean;
    u.body.position.y = u.bodyY;
    u.body.scale.set(1, u.sy, u.sz);
    u.headPivot.rotation.x = u.head;
    for (const w of u.wings) w.rotation.z = w.userData.side * u.wingOut;
    for (const l of u.legs) l.rotation.x = l.userData.side * u.legSwing - u.tuck;

    // Hit flash
    if (f.flash > 0) {
      u.bodyMat.emissive.setHex(0xffffff);
      u.bodyMat.emissiveIntensity = Math.min(1, f.flash / 0.1);
    } else {
      u.bodyMat.emissive.setHex(0x000000);
      u.bodyMat.emissiveIntensity = 0.6;
    }

    // Aura grows with the domain meter and flares while a domain is active.
    const domain = f.domain.active;
    u.auraMat.opacity = 0.1 + f.energy / 450 + (domain ? 0.25 : 0) + (f.energy >= 100 ? Math.sin(time * 10) * 0.05 : 0);
    u.auraMesh.scale.setScalar(1 + Math.sin(time * 4 + u.phase) * 0.035 + f.energy / 500 + (domain ? 0.25 : 0));

    // Guard bubble
    u.shieldPulse = Math.max(0, u.shieldPulse - dt * 4);
    const shieldT = (f.state === 'block' ? 0.2 : 0) + u.shieldPulse * 0.5;
    u.shieldMat.opacity = damp(u.shieldMat.opacity, shieldT, 25, dt);
    u.shield.visible = u.shieldMat.opacity > 0.01;
    u.shield.position.set(0, 1.05, 0);

    // Blob shadow
    u.blob.position.x = f.x;
    const sh = Math.max(0.4, 1 - f.y * 0.3);
    u.blob.scale.set(sh, sh, sh);
    u.blobMat.opacity = 0.35 * sh;
  }

  // ---- effects ------------------------------------------------------------
  const particles = [];
  const rings = [];
  const slashes = [];
  const bolts = new Map();
  const tetra = new THREE.TetrahedronGeometry(1);
  const ringGeo = new THREE.RingGeometry(0.2, 0.32, 28);
  const slashGeo = new THREE.TorusGeometry(0.6, 0.055, 6, 30, Math.PI * 1.2);
  const boltCore = new THREE.SphereGeometry(0.28, 14, 10);
  const boltGlow = new THREE.SphereGeometry(0.5, 14, 10);

  function burst(x, y, color, count = 16, speed = 3, up = 4) {
    const room = 280 - particles.length;
    for (let i = 0; i < Math.min(count, room); i++) {
      const m = new THREE.Mesh(tetra, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.scale.setScalar(0.06 + Math.random() * 0.08);
      m.position.set(x, y, 0.2);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * speed;
      m.userData = {
        vx: Math.cos(a) * s,
        vy: Math.random() * up,
        vz: Math.sin(a) * s * 0.6,
        life: 0.45 + Math.random() * 0.6,
        max: 1,
      };
      m.userData.max = m.userData.life;
      particles.push(m);
    }
  }

  function addRing(x, y, color, size = 1) {
    const m = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.position.set(x, y, 0.4);
    m.scale.setScalar(0.4 * size);
    scene.add(m);
    rings.push({ m, life: 0.28, max: 0.28, size });
  }

  function addSlash(x, y, color, dir) {
    const group = new THREE.Group();
    const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    group.add(m);
    group.position.set(x, y, 0.3);
    group.rotation.z = dir > 0 ? -0.6 : Math.PI + 0.6;
    scene.add(group);
    slashes.push({ group, m, life: 0.22, max: 0.22 });
  }

  const ATTACK_COLORS = { light: 0x79eaff, heavy: 0xffd36e, special: 0xbb61ff };

  // Camera shake amplitude (decays) and the smoothed camera target.
  let shake = 0;
  const camBase = new THREE.Vector3(0, 6.4, 12.5);
  const lookAt = new THREE.Vector3(0, 0.9, 0);

  function onEvent(e, g) {
    switch (e.type) {
      case 'hit': {
        const col = ATTACK_COLORS[e.attack] || 0x79eaff;
        const big = e.attack === 'heavy' ? 1.4 : e.attack === 'special' ? 1.2 : 0.9;
        burst(e.x, e.y, col, e.attack === 'light' ? 12 : 24, 3 + big * 1.5);
        addRing(e.x, e.y, col, big * (1 + Math.min(e.combo, 6) * 0.08));
        if (!e.projectile) addSlash(e.x, e.y, col, e.dir);
        shake = Math.max(shake, e.attack === 'heavy' ? 0.2 : e.attack === 'special' ? 0.15 : 0.07);
        break;
      }
      case 'block': {
        burst(e.x, e.y, 0xfff2b0, 9, 2.5);
        addRing(e.x, e.y, 0xfff2b0, 0.6);
        chickens[e.target].userData.shieldPulse = 1;
        shake = Math.max(shake, 0.03);
        break;
      }
      case 'dodge': burst(e.x, 0.3, 0xcfe6ff, 7, 2, 1.5); break;
      case 'jump': burst(e.x, 0.1, 0x9aa3d6, 5, 1.8, 1.2); break;
      case 'land': burst(e.x, 0.1, 0x9aa3d6, 6, 2.2, 1.2); break;
      case 'projectile': burst(e.x, e.y, 0xbb61ff, 8, 2); break;
      case 'clash': burst(e.x, e.y, 0xffffff, 22, 4); addRing(e.x, e.y, 0xffffff, 1.4); break;
      case 'domainTick': burst(e.x, e.y, g.p1.domain.active ? 0x6eeaff : 0xc14bff, 6, 1.5); break;
      case 'ko': {
        burst(e.x, e.y, 0xffffff, 60, 6, 6);
        addRing(e.x, e.y, 0xffe28a, 2.8);
        shake = 0.5;
        break;
      }
      case 'domainStart': {
        const f = g.byId(e.id);
        burst(f.x, 1, e.id === 'p1' ? 0x6eeaff : 0xc14bff, 70, 5, 6);
        addRing(f.x, 1, e.id === 'p1' ? 0x6eeaff : 0xc14bff, 3);
        shake = 0.35;
        break;
      }
      default: break;
    }
  }

  // ---- domain dome --------------------------------------------------------
  const domains = {};
  for (const id of ['p1', 'p2']) {
    const color = id === 'p1' ? 0x52dfff : 0x9c36ff;
    const grp = new THREE.Group();
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(10, 36, 22),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.25 }),
    );
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(9.8, 28, 18),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }),
    );
    grp.add(wire, glass);
    grp.position.set(0, 2, 0);
    grp.visible = false;
    scene.add(grp);
    domains[id] = { grp, wire, glass, k: 0, color };
  }

  // ---- per-frame ----------------------------------------------------------
  const tmpBg = new THREE.Color();
  const tmpV = new THREE.Vector3();

  function render(dt, g, events, time) {
    for (const e of events) onEvent(e, g);

    poseChicken(c1, g.p1, g, dt, time);
    poseChicken(c2, g.p2, g, dt, time);

    // projectiles
    const live = new Set();
    for (const p of g.projectiles) {
      live.add(p.id);
      let b = bolts.get(p.id);
      if (!b) {
        const grp = new THREE.Group();
        const col = p.owner === 'p1' ? 0x6eeaff : 0xc14bff;
        grp.add(new THREE.Mesh(boltCore, new THREE.MeshBasicMaterial({ color: 0xffffff })));
        grp.add(new THREE.Mesh(
          boltGlow,
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false }),
        ));
        scene.add(grp);
        b = { grp, col };
        bolts.set(p.id, b);
      }
      b.grp.position.set(p.x, p.y, 0.1);
      b.grp.rotation.z += dt * 8;
      b.grp.scale.setScalar(1 + Math.sin(time * 30) * 0.12);
      if (Math.random() < 0.7) burst(p.x - Math.sign(p.vx) * 0.3, p.y, b.col, 1, 0.8, 0.8);
    }
    for (const [id, b] of bolts) {
      if (!live.has(id)) {
        scene.remove(b.grp);
        b.grp.children.forEach((m) => m.material.dispose());
        bolts.delete(id);
      }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const u = p.userData;
      u.life -= dt;
      p.position.x += u.vx * dt;
      p.position.y = Math.max(0.02, p.position.y + u.vy * dt);
      p.position.z += u.vz * dt;
      u.vy -= 6 * dt;
      p.material.opacity = Math.max(0, u.life / u.max);
      p.rotation.x += dt * 5;
      p.rotation.y += dt * 4;
      if (u.life <= 0) {
        scene.remove(p);
        p.material.dispose();
        particles.splice(i, 1);
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.m.scale.setScalar((0.4 + t * 2.2) * r.size);
      r.m.material.opacity = Math.max(0, 0.9 * (1 - t));
      if (r.life <= 0) {
        scene.remove(r.m);
        r.m.material.dispose();
        rings.splice(i, 1);
      }
    }
    for (let i = slashes.length - 1; i >= 0; i--) {
      const s = slashes[i];
      s.life -= dt;
      s.group.scale.multiplyScalar(1 + dt * 5);
      s.m.material.opacity = Math.max(0, s.life / s.max);
      if (s.life <= 0) {
        scene.remove(s.group);
        s.m.material.dispose();
        slashes.splice(i, 1);
      }
    }

    // domain dome + ambience
    let bgTarget = BASE_BG;
    let lightTarget = 0;
    for (const id of ['p1', 'p2']) {
      const d = domains[id];
      const active = g.byId(id).domain.active;
      d.k = damp(d.k, active ? 1 : 0, active ? 3.5 : 3, dt);
      d.grp.visible = d.k > 0.02;
      if (d.grp.visible) {
        d.grp.scale.setScalar(0.3 + 0.7 * d.k);
        d.grp.rotation.y += dt * 0.25;
        d.wire.material.opacity = 0.25 * d.k;
        d.glass.material.opacity = 0.12 * d.k;
      }
      if (active) {
        bgTarget = DOMAIN_COLORS[id];
        lightTarget = 90;
        domainLight.color.setHex(d.color);
      }
    }
    tmpBg.setHex(bgTarget);
    scene.background.lerp(tmpBg, 1 - Math.exp(-3 * dt));
    scene.fog.color.copy(scene.background);
    domainLight.intensity = damp(domainLight.intensity, lightTarget, 3, dt);

    const domainK = Math.max(domains.p1.k, domains.p2.k);
    for (const f of fades) f.m.opacity = f.base * (1 - Math.min(1, domainK * 1.15));
    for (const c of clouds) {
      c.position.x = c.userData.baseX + Math.sin(time * 0.02 * c.userData.speed * 10) * 6;
      c.visible = domainK < 0.97;
    }

    for (const c of crystals) {
      c.rotation.y += dt * c.userData.spin;
      c.rotation.x += dt * 0.3;
    }

    // camera: frame both fighters, push in on KOs and domain casts, add shake
    const gap = Math.abs(g.p1.x - g.p2.x);
    let tx = (g.p1.x + g.p2.x) / 2;
    let ty = 5.6 + gap * 0.22;
    let tz = Math.min(15.5, Math.max(11.5, 10.5 + gap * 0.55));
    let ly = 0.9;
    if (g.phase === 'ko' && g.timeScale < 1) {
      const loser = g.p1.ko ? g.p1 : g.p2.ko ? g.p2 : null;
      if (loser) {
        tx = loser.x;
        ty = 3.2;
        tz = 8;
        ly = 0.8;
      }
    }
    if (g.cinematic) {
      const o = g.byId(g.cinematic.owner);
      tx = o.x * 0.8;
      ty = 3.4;
      tz = 8.5;
      ly = 1.2;
    }
    camBase.x = damp(camBase.x, tx, 4, dt);
    camBase.y = damp(camBase.y, ty, 3, dt);
    camBase.z = damp(camBase.z, tz, 3, dt);
    lookAt.x = damp(lookAt.x, tx, 6, dt);
    lookAt.y = damp(lookAt.y, ly, 4, dt);
    shake = Math.max(0, shake - dt * 1.6);
    camera.position.set(
      camBase.x + (Math.random() - 0.5) * shake,
      camBase.y + (Math.random() - 0.5) * shake,
      camBase.z,
    );
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  }

  /** World position -> screen pixels (for floating damage numbers). */
  function project(x, y) {
    tmpV.set(x, y, 0).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * innerWidth, y: (-tmpV.y * 0.5 + 0.5) * innerHeight };
  }

  return { render, resize, project, renderer };
}
