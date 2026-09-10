import * as THREE from '../lib/pet/three.module.js';
import { RoundedBoxGeometry } from '../lib/pet/RoundedBoxGeometry.js';
import { mergeGeometries } from '../lib/pet/BufferGeometryUtils.js';
import { roomMaterial } from './materials.js';

// Interaction anchors survive geometry batching. Floor bounds are shared with
// navigation, while wall art and airborne effects never close a walking route.
export function createActivities(stage, furniture, anisotropy) {
  const groups = [], wallGroups = [], items = [];
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...extra });
  const m = {
    oak: roomMaterial('oak', 0xffffff, [1, 1], anisotropy),
    cream: mat(0xffefd3), brass: mat(0xc89d60, { metalness: .65, roughness: .3 }),
    sage: roomMaterial('linen', 0x95ad99, [3, 3], anisotropy),
    rose: mat(0xdba88f), ink: mat(0x485b58), teal: mat(0x779eac),
    gold: mat(0xf0c56e), glow: mat(0xffe2a2, { emissive: 0xffc579, emissiveIntensity: .8 })
  };
  const group = (name, position, angle = 0, wall = false) => {
    const root = new THREE.Group(); root.name = name;
    root.position.set(...position); root.rotation.y = angle; stage.add(root);
    (wall ? wallGroups : groups).push(root);
    return root;
  };
  const add = (root, geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const box = (root, size, position, material, radius = .03) => add(root, new RoundedBoxGeometry(...size, 2, radius), material, position);
  const ball = (root, size, position, material) => {
    const mesh = add(root, new THREE.SphereGeometry(1, 24, 16), material, position);
    mesh.scale.set(...size); return mesh;
  };
  const cylinder = (root, r, h, position, material) => add(root, new THREE.CylinderGeometry(r, r, h, 32), material, position);
  const torus = (root, r, tube, position, material) => add(root, new THREE.TorusGeometry(r, tube, 10, 40), material, position);

  const console = group('泡泡与音乐边柜', [5.9, 0, 9.35], Math.PI);
  for (const x of [-1.7, 1.7]) for (const z of [-.45, .45]) cylinder(console, .075, .38, [x, .19, z], m.brass);
  box(console, [3.85, 1.55, 1.15], [0, 1.08, 0], m.oak, .10);
  for (const x of [-1.24, 0, 1.24]) {
    box(console, [1.18, 1.31, .06], [x, 1.08, .61], m.sage, .055);
    for (let i = 0; i < 7; i++) box(console, [.025, 1.1, .025], [x - .45 + i * .15, 1.08, .65], m.oak, .008);
    ball(console, [.045, .045, .035], [x + .40, 1.17, .68], m.brass);
  }
  // Porcelain whale bubble machine, with a real aperture and a tiny switch.
  ball(console, [.55, .32, .34], [-.9, 2.18, .02], m.teal);
  ball(console, [.22, .10, .23], [-1.42, 2.12, .02], m.teal).rotation.z = -.4;
  for (const side of [-1, 1]) ball(console, [.13, .045, .22], [-1.52, 2.17, side * .13], m.teal).rotation.y = side * .6;
  ball(console, [.028, .035, .023], [-.6, 2.26, .30], m.ink);
  torus(console, .08, .022, [-.91, 2.48, .02], m.brass).rotation.x = Math.PI / 2;
  cylinder(console, .063, .016, [-.91, 2.483, .02], m.ink);
  box(console, [.15, .055, .10], [-.3, 1.89, .32], m.rose);
  // A record player: the record and its grooves remain a separate animated part.
  box(console, [1.25, .18, .83], [.85, 1.95, 0], m.rose, .06);
  const record = new THREE.Group(); record.position.set(.68, 2.06, .02); console.add(record);
  cylinder(record, .34, .026, [0, 0, 0], m.ink);
  for (const r of [.17, .23, .29]) torus(record, r, .004, [0, .016, 0], m.brass).rotation.x = Math.PI / 2;
  cylinder(record, .12, .03, [0, .008, 0], m.gold);
  cylinder(record, .016, .07, [0, .04, 0], m.brass);
  box(console, [.035, .04, .53], [1.25, 2.13, -.02], m.brass).rotation.y = -.4;
  box(console, [.09, .065, .10], [1.14, 2.10, .22], m.ink);

  const snug = group('门边迎宾软垫', [9.75, 0, 7.7]);
  box(snug, [2.35, .018, 1.0], [0, -.012, 0], m.sage, .008);
  for (let i = 0; i < 9; i++) box(snug, [.026, .004, .78], [-.98 + i * .245, -.001, 0], m.cream, .001);
  // A stitched bunny, slippers and a closed keepsake box fill the opposite corner.
  const keepsake = group('兔兔与纪念箱', [-9.4, 0, 8.9], .45);
  box(keepsake, [1.9, .76, 1.15], [0, .40, 0], m.oak, .06);
  box(keepsake, [1.96, .13, 1.2], [0, .845, 0], m.sage, .05);
  box(keepsake, [.22, .21, .055], [0, .72, .60], m.brass);
  ball(keepsake, [.29, .36, .23], [-.2, 1.21, .02], m.cream);
  ball(keepsake, [.28, .26, .23], [-.2, 1.65, .02], m.cream);
  for (const sign of [-1, 1]) {
    ball(keepsake, [.095, .30, .09], [-.2 + sign * .15, 1.99, .01], m.cream).rotation.z = -sign * .13;
    ball(keepsake, [.045, .22, .025], [-.2 + sign * .15, 2, .093], m.rose).rotation.z = -sign * .13;
    ball(keepsake, [.021, .025, .02], [-.2 + sign * .10, 1.68, .232], m.ink);
    ball(keepsake, [.13, .08, .19], [-.2 + sign * .18, .97, .19], m.cream);
    const slipper = ball(keepsake, [.17, .09, .32], [.75 + sign * .22, .12, .94], m.rose);
    slipper.rotation.y = sign * .1;
  }
  ball(keepsake, [.031, .023, .02], [-.2, 1.59, .251], m.rose);
  box(keepsake, [.52, .07, .44], [-.2, 1.43, .03], m.teal);

  const photographs = [];
  for (const [name, texture, x] of [['林间晨光', 'forest', -6.5], ['海边的早晨', 'coast', 6.5]]) {
    const root = group(name, [x, 4.85, 10.22], Math.PI, true);
    box(root, [3.22, 2.23, .13], [0, 0, 0], m.oak, .055);
    box(root, [3.0, 2.01, .025], [0, 0, .08], m.cream, .008);
    const map = new THREE.TextureLoader().load(`/img/pet-room/paws-${texture}.webp`);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = anisotropy;
    const print = add(root, new THREE.PlaneGeometry(2.76, 1.84), mat(0xffffff, { map, roughness: .95 }), [0, 0, .096]);
    print.castShadow = false;
    photographs.push(root);
    const lamp = cylinder(root, .04, 1.4, [0, 1.31, .34], m.brass); lamp.rotation.z = Math.PI / 2;
  }

  const byName = name => furniture.groups.find(root => root.name === name);
  const item = (id, label, detail, root, approach, pose, duration = 5, reward = 3) => {
    root.userData.activity = id;
    const entry = { id, label, detail, root, preferred: new THREE.Vector3(...approach), pose, duration, reward };
    items.push(entry); return entry;
  };
  item('snack', '能量下午茶', '到小餐台闻闻香气，补充能量', byName('双碗小餐台'), [-5.5, 0, -2.1], 'sniff', 5, 3);
  item('read', '沙发故事会', '在沙发旁听一个温柔的小故事', byName('阅读沙发'), [-4.0, 0, -4.0], 'watch', 7, 4);
  item('music', '一起摇摆', '放一张唱片，和小狗跳一支舞', record, [5.2, 0, 6.7], 'dance', 8, 4);
  byName('收藏书柜').userData.activity = 'music';
  item('lamp', '点亮阅读灯', '让小狗陪你点亮阅读角', byName('阅读落地灯'), [-2.5, 0, -4.0], 'paw', 3, 2);
  const bed = item('bed', '回窝睡一会', '走到窝前，跳上软垫慢慢入睡', byName('小狗的布艺睡窝'), [7.1, 0, -1.9], 'sleep', 10, 4);
  item('gym', '逗逗绒球', '抬起小爪，和悬挂绒球打招呼', byName('小狗玩具架'), [-6.8, 0, .5], 'paw', 5, 3);
  item('fetch', '玩具大作战', '去推车挑一颗球，再捡回来', byName('玩具收纳推车'), [6.5, 0, .2], 'sniff', 2, 2);
  item('yarn', '毛线球秘密', '发现篮子里藏着的彩色毛线', byName('毛线与玩具篮'), [7.1, 0, 3.0], 'sniff', 4, 3);
  item('train', '小火车出发', '看小火车来回开，兴奋地摇尾巴', byName('木质小火车'), [-3.5, 0, 7.3], 'watch', 6, 3);
  item('blocks', '积木建筑师', '轻轻碰碰小城堡，庆祝搭建成功', byName('积木小城堡'), [-6.5, 0, 4.5], 'paw', 5, 3);
  item('bubbles', '鲸鱼泡泡机', '走到边柜开泡泡，轻点泡泡收集星光', console, [5.9, 0, 6.7], 'watch', 14, 4);
  item('welcome', '迎接好朋友', '跑到门边，开心挥爪欢迎你回家', snug, [9.0, 0, 6.1], 'paw', 4, 3);
  item('bunny', '兔兔晚安', '到纪念箱前，和兔兔说说悄悄话', keepsake, [-7.1, 0, 7.8], 'sniff', 4, 3);
  photographs.forEach((root, i) => item(i ? 'coast' : 'forest', root.name, '走近照片，收藏一段旅行想象', root, [i ? 3.2 : -6.5, 0, 7.9], 'watch', 5, 3));
  // The door and tabletop are also clickable; thin proxies retain IDs after
  // architecture batching and never change collision or visible materials.
  const doorHit = new THREE.Mesh(new THREE.BoxGeometry(.18, 6.15, 2.9), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  doorHit.position.set(11.12, 3.075, 5.9); doorHit.userData.activity = 'welcome'; stage.add(doorHit);
  byName('茶几与下午茶').userData.activity = 'snack';

  // Rendered effects have bounded lifetimes and reuse geometry/materials.
  const fx = new THREE.Group(); fx.name = '泡泡与寻宝星光'; stage.add(fx);
  const bubbles = [];
  const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc2e6ee, transparent: true, opacity: .28, roughness: .08, metalness: .08, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.3, side: THREE.FrontSide, depthWrite: false });
  const bubbleGeometry = new THREE.SphereGeometry(1, 24, 16);
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(bubbleGeometry, bubbleMaterial); mesh.visible = false;
    mesh.userData.bubble = i; fx.add(mesh);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7 }));
    glint.scale.set(.16, .055, .025); glint.position.set(-.32, .61, .71); glint.rotation.z = .5; mesh.add(glint);
    bubbles.push(mesh);
  }
  const tokens = [];
  for (let i = 0; i < 3; i++) {
    const root = new THREE.Group(); root.visible = false; root.userData.treasure = i; fx.add(root);
    const hoop = torus(root, .32, .028, [0, .025, 0], m.glow); hoop.rotation.x = Math.PI / 2;
    const shape = new THREE.Shape();
    for (let j = 0; j < 10; j++) {
      const a = Math.PI / 2 + j * Math.PI / 5, r = j % 2 ? .13 : .27;
      if (!j) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    add(root, new THREE.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: true, bevelSize: .018, bevelThickness: .018, bevelSegments: 2 }), m.glow, [0, .46, 0]);
    tokens.push(root);
  }
  const treat = ball(fx, [.075, .075, .075], [0, 0, 0], m.gold); treat.visible = false;

  // Bake static parts; the spinning vinyl is deliberately retained.
  for (const root of [...groups, ...wallGroups]) {
    const buckets = new Map();
    for (const mesh of [...root.children]) {
      if (!mesh.isMesh) continue;
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(geometry); root.remove(mesh); mesh.geometry.dispose();
    }
    for (const [material, geometries] of buckets) {
      add(root, mergeGeometries(geometries), material, [0, 0, 0]);
      geometries.forEach(geometry => geometry.dispose());
    }
  }
  stage.updateWorldMatrix(true, true);
  items.forEach(entry => {
    entry.focus = new THREE.Box3().setFromObject(entry.root).getCenter(new THREE.Vector3());
    if (entry.id === 'welcome') entry.focus.set(11.1, 1.8, 5.9);
    entry.base = entry.root.position.clone();
  });
  // Front-facing transfer corridor, clear of both bolsters. Support height includes the blanket.
  bed.landing = bed.root.localToWorld(new THREE.Vector3(0, .66, .10));
  bed.preferred = bed.root.localToWorld(new THREE.Vector3(0, 0, 3.8)).setY(0);
  const train = byName('木质小火车').userData.carriages;
  const pendulum = byName('小狗玩具架').userData.pendulum;
  let bubbleStart = -Infinity, activeId = null, started = 0, music = false;
  return {
    groups, wallGroups, items, bubbles, tokens,
    start(id, time) { activeId = id; started = time; if (id === 'bubbles') bubbleStart = time; },
    setMusic(playing) { music = playing; },
    stop() { activeId = null; treat.visible = false; },
    clear() { activeId = null; bubbleStart = -Infinity; bubbles.forEach(b => { b.visible = false; }); treat.visible = false; },
    pop(index) { bubbles[index].visible = false; bubbles[index].userData.popped = true; },
    setNight(amount) { m.glow.emissiveIntensity = .6 + amount * .9; },
    update(time, reduced, mouth) {
      const elapsed = time - started;
      if (music && !reduced) record.rotation.y = time * .65;
      train.position.x = activeId === 'train' && !reduced ? Math.sin(elapsed * 2) * .18 * Math.min(1, elapsed * 2, Math.max(0, (6 - elapsed) * 2)) : 0;
      pendulum.rotation.x = activeId === 'gym' && !reduced ? Math.sin(elapsed * 5) * .24 * Math.sin(Math.min(1, elapsed / 5) * Math.PI) : 0;
      const showBubbles = time - bubbleStart < 16;
      bubbles.forEach((mesh, i) => {
        const age = time - bubbleStart - i * .55;
        const cycle = Math.floor(age / 6);
        if (mesh.userData.cycle !== cycle || mesh.userData.start !== bubbleStart) {
          mesh.userData.cycle = cycle; mesh.userData.start = bubbleStart; mesh.userData.popped = false;
        }
        const phase = ((age % 6) + 6) % 6;
        mesh.visible = showBubbles && age >= 0 && !mesh.userData.popped;
        mesh.scale.setScalar((.18 + i % 3 * .065) * Math.min(1, phase * 3));
        mesh.position.set(6.8 + Math.sin(i * 2.4) * phase * .24, 2.6 + (reduced ? i % 4 * .32 : phase * .43), 8.9 - phase * .5);
      });
      tokens.forEach((root, i) => {
        root.children[1].rotation.y = reduced ? .2 : time * .8 + i;
        root.children[1].position.y = .46 + (reduced ? 0 : Math.sin(time * 2 + i) * .07);
      });
      treat.visible = activeId === 'snack' && elapsed > 1.3 && elapsed < 3.3;
      if (treat.visible && mouth) {
        const phase = THREE.MathUtils.clamp((elapsed - 1.3) / 2, 0, 1);
        const source = byName('双碗小餐台').localToWorld(new THREE.Vector3(.39, .43, 0));
        treat.position.lerpVectors(source, mouth, phase * phase * (3 - 2 * phase));
        treat.position.y += Math.sin(phase * Math.PI) * .35;
      }
    }
  };
}
