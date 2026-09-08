import * as THREE from '../lib/pet/three.module.js';
import { RoundedBoxGeometry } from '../lib/pet/RoundedBoxGeometry.js';
import { mergeGeometries } from '../lib/pet/BufferGeometryUtils.js';
import { roomMaterial } from './materials.js';

// Small, locally built objects share materials and geometry. Each furniture group
// is baked by material at the end, keeping the room inexpensive to orbit.
export function createFurnishings(stage, anisotropy = 4) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...extra });
  const m = {
    wood: roomMaterial('oak', 0xffffff, [1, 1], anisotropy), darkWood: roomMaterial('oak', 0x98785c, [1, 1], anisotropy),
    cream: mat(0xf3e8d2), paper: mat(0xfff4de), teal: roomMaterial('linen', 0x718b7d, [3, 3], anisotropy),
    fabric: roomMaterial('linen', 0xe5d5b9, [2, 2], anisotropy), coral: roomMaterial('linen', 0xd69b81, [2, 2], anisotropy), mustard: mat(0xe3b653),
    blue: mat(0x719cba), mint: mat(0xa6c7b7), green: mat(0x507c53), leaf: mat(0x8fac65),
    ink: mat(0x384d50), pink: mat(0xd5a1a0), metal: mat(0xa49066, { metalness: .55, roughness: .38 }),
    glow: mat(0xffe2a1, { emissive: 0xffbf60, emissiveIntensity: .18 }),
    water: mat(0x7baeb9, { metalness: .3, roughness: .2 })
  };
  const groups = [], lights = [], geometryCache = new Map(), sharedGeometries = new Set();
  const geometry = (key, build) => {
    if (!geometryCache.has(key)) {
      const geo = build();
      geometryCache.set(key, geo);
      sharedGeometries.add(geo);
    }
    return geometryCache.get(key);
  };
  const group = (name, position, angle = 0) => {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(...position);
    root.rotation.y = angle;
    stage.add(root);
    groups.push(root);
    return root;
  };
  const add = (root, geo, material, position) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (root, size, position, material, radius = .04) => add(root,
    geometry('b' + size.join(',') + '/' + radius, () => radius <= .015 ? new THREE.BoxGeometry(...size) : new RoundedBoxGeometry(...size, 2, radius)), material, position);
  const sphere = (root, size, position, material) => {
    const mesh = add(root, geometry('sphere', () => new THREE.SphereGeometry(1, 20, 12)), material, position);
    mesh.scale.set(...size);
    return mesh;
  };
  const cylinder = (root, top, bottom, height, position, material) => add(root,
    geometry(`c${top}/${bottom}/${height}`, () => new THREE.CylinderGeometry(top, bottom, height, 32)), material, position);
  const ring = (root, radius, thickness, position, material) => add(root,
    geometry(`r${radius}/${thickness}`, () => new THREE.TorusGeometry(radius, thickness, 8, radius < .3 ? 24 : 40)), material, position);
  const line = (root, points, radius, material) => add(root,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 6, false), material, [0, 0, 0]);
  const book = (root, x, y, z, color, height = .65, width = .18) => {
    box(root, [width, height, .48], [x, y + height / 2, z], color, .012);
    box(root, [width * .75, .025, .012], [x, y + height * .77, z + .247], m.paper, .003);
    box(root, [width * .75, .016, .012], [x, y + height * .22, z + .247], m.paper, .003);
  };
  const plant = (root, x, y, z, scale = 1) => {
    cylinder(root, .21 * scale, .15 * scale, .32 * scale, [x, y + .16 * scale, z], m.coral);
    cylinder(root, .215 * scale, .215 * scale, .055 * scale, [x, y + .32 * scale, z], m.cream);
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.4;
      const leaf = sphere(root, [.1 * scale, .3 * scale, .055 * scale],
        [x + Math.cos(angle) * .12 * scale, y + .48 * scale, z + Math.sin(angle) * .12 * scale], i % 2 ? m.green : m.leaf);
      leaf.rotation.set(Math.sin(angle) * .7, 0, Math.cos(angle) * .7);
    }
  };
  const mug = (root, x, y, z, material) => {
    cylinder(root, .16, .13, .27, [x, y + .135, z], material);
    cylinder(root, .132, .132, .008, [x, y + .275, z], m.darkWood);
    ring(root, .105, .035, [x + .18, y + .15, z], material);
  };
  const bear = (root, x, y, z, scale = 1) => {
    const part = (size, offset, material) => sphere(root, size.map(v => v * scale), offset.map((v, i) => [x, y, z][i] + v * scale), material);
    part([.29, .35, .23], [0, .4, 0], m.mustard);
    part([.3, .28, .25], [0, .84, .015], m.mustard);
    for (const sign of [-1, 1]) {
      part([.12, .13, .08], [sign * .24, 1.03, 0], m.mustard);
      part([.065, .07, .02], [sign * .24, 1.04, .075], m.pink);
      part([.13, .2, .14], [sign * .31, .43, .01], m.mustard);
      part([.16, .12, .2], [sign * .18, .13, .14], m.mustard);
      part([.026, .032, .02], [sign * .105, .87, .25], m.ink);
    }
    part([.13, .095, .045], [0, .76, .25], m.cream);
    part([.035, .025, .02], [0, .79, .295], m.ink);
    box(root, [.35 * scale, .095 * scale, .42 * scale], [x, y + .62 * scale, z + .015 * scale], m.coral, .03);
  };

  // Furnishing bounds are shared by navigation, camera and rigid-body collisions.
  const sofa = group('阅读沙发', [-5.8, 0, -6.75]);
  for (const x of [-1.9, 1.9]) for (const z of [-.55, .55]) cylinder(sofa, .085, .065, .35, [x, .17, z], m.darkWood);
  box(sofa, [4.65, .48, 1.8], [0, .51, 0], m.teal, .17);
  box(sofa, [4.55, 1.35, .34], [0, 1.3, -.72], m.teal, .15);
  for (const x of [-2.13, 2.13]) box(sofa, [.38, .9, 1.78], [x, 1.02, 0], m.teal, .16);
  for (const x of [-1.04, 0, 1.04]) box(sofa, [1.0, .23, 1.4], [x, .87, .04], m.mint, .10);
  const cushion = box(sofa, [.74, .74, .22], [-1.27, 1.4, -.40], m.coral, .14);
  cushion.rotation.set(-.16, 0, -.17);
  const pillow = box(sofa, [.65, .65, .23], [1.26, 1.34, -.39], m.mustard, .13);
  pillow.rotation.z = .19;
  box(sofa, [.72, .07, 1.42], [.42, 1.015, .1], m.fabric, .028);
  box(sofa, [.72, .55, .07], [.42, .76, .83], m.fabric, .025);
  for (let i = 0; i < 5; i++) {
    box(sofa, [.024, .56, .018], [.13 + i * .14, .76, .873], m.coral, .003);
    line(sofa, [[.13 + i * .14, .48, .86], [.14 + i * .14, .39, .88]], .012, m.fabric);
  }
  bear(sofa, -.35, 1, -.08, .75);

  const table = group('茶几与下午茶', [-8.3, 0, -3.65], .15);
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    cylinder(table, .065, .09, .85, [Math.cos(angle) * .6, .44, Math.sin(angle) * .6], m.darkWood);
  }
  cylinder(table, 1.03, 1.01, .14, [0, .92, 0], m.wood);
  cylinder(table, .51, .51, .045, [.04, 1.01, .04], m.cream);
  mug(table, -.17, 1.04, .13, m.coral);
  cylinder(table, .2, .2, .025, [.3, 1.055, .12], m.mustard);
  sphere(table, [.1, .055, .085], [.3, 1.095, .12], m.darkWood);
  box(table, [.52, .09, .66], [-.4, 1.04, -.4], m.blue, .015).rotation.y = -.3;
  plant(table, .48, 1, -.4, .6);

  const lamp = group('阅读落地灯', [-2.45, 0, -6.25]);
  cylinder(lamp, .43, .47, .09, [0, .055, 0], m.darkWood);
  cylinder(lamp, .035, .035, 3.15, [0, 1.61, 0], m.metal);
  cylinder(lamp, .4, .7, .7, [0, 3.23, 0], m.cream);
  cylinder(lamp, .62, .62, .022, [0, 2.88, 0], m.glow);
  sphere(lamp, [.13, .16, .13], [0, 2.84, 0], m.glow);
  const readingLight = new THREE.PointLight(0xffc77e, 0, 7, 2);
  readingLight.position.set(0, 2.7, .25);
  lamp.add(readingLight);
  lights.push(readingLight);

  // Open shelving, with different silhouettes in every cubby.
  const shelf = group('收藏书柜', [.5, 0, -7.35]);
  box(shelf, [3.65, 3.5, .1], [0, 1.92, -.47], m.darkWood);
  for (const x of [-1.8, 0, 1.8]) box(shelf, [.12, 3.5, 1.0], [x, 1.92, 0], m.wood);
  for (const y of [.2, 1.35, 2.5, 3.66]) box(shelf, [3.78, .12, 1.06], [0, y, 0], m.wood);
  for (const x of [-1.5, 1.5]) box(shelf, [.12, .2, .65], [x, .07, 0], m.darkWood);
  [m.coral, m.blue, m.mustard, m.mint, m.pink].forEach((color, i) => book(shelf, -1.53 + i * .26, 1.42, .05, color, .65 + (i % 3) * .12, .2));
  for (const x of [-.94, .89]) {
    box(shelf, [1.28, .7, .72], [x, .62, .08], m.fabric, .05);
    box(shelf, [.33, .14, .015], [x, .69, .45], m.cream, .02);
    for (let i = 0; i < 5; i++) box(shelf, [1.2, .014, .01], [x, .37 + i * .115, .45], m.wood, .002);
  }
  // Radio with a fabric speaker, dial and antenna.
  box(shelf, [1.25, .64, .53], [.86, 1.75, .06], m.mint, .1);
  cylinder(shelf, .22, .22, .025, [.6, 1.76, .34], m.fabric).rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) box(shelf, [.29, .015, .018], [.6, 1.63 + i * .064, .362], m.darkWood, .003);
  cylinder(shelf, .075, .075, .045, [1.17, 1.7, .35], m.metal).rotation.x = Math.PI / 2;
  box(shelf, [.24, .07, .02], [1.17, 1.89, .34], m.ink, .01);
  line(shelf, [[1.26, 2.07, 0], [1.42, 2.36, 0]], .012, m.metal);
  // Tiny rocket and a framed photograph.
  cylinder(shelf, .17, .22, .55, [-1.02, 2.92, .06], m.cream);
  cylinder(shelf, 0, .17, .28, [-1.02, 3.335, .06], m.coral);
  cylinder(shelf, .085, .085, .03, [-1.02, 3.01, .25], m.blue).rotation.x = Math.PI / 2;
  for (const x of [-1.26, -.78]) box(shelf, [.13, .3, .25], [x, 2.76, .06], m.coral, .04);
  box(shelf, [.56, .65, .07], [-.38, 2.89, .15], m.cream, .025);
  box(shelf, [.45, .54, .015], [-.38, 2.89, .196], m.blue, .01);
  sphere(shelf, [.12, .12, .015], [-.38, 2.93, .21], m.mustard);
  bear(shelf, .85, 2.57, .05, .75);
  plant(shelf, -1.15, 3.73, 0, 1.2);
  box(shelf, [.8, .1, .54], [.8, 3.78, 0], m.coral, .012);
  box(shelf, [.72, .1, .5], [.85, 3.88, 0], m.mustard, .012).rotation.y = -.1;

  // Wall gallery and clock are shallow so they do not eat into the play area.
  const gallery = group('墙面画廊', [3.85, 4.65, -7.8]);
  box(gallery, [1.95, 2.5, .12], [0, 0, 0], m.wood, .04);
  box(gallery, [1.75, 2.3, .025], [0, 0, .075], m.paper, .015);
  sphere(gallery, [.34, .34, .012], [.34, .57, .1], m.mustard);
  sphere(gallery, [.77, .47, .012], [-.08, -.49, .11], m.mint);
  sphere(gallery, [.58, .28, .012], [.24, -.7, .14], m.teal);
  box(gallery, [1.43, .035, .015], [0, -.99, .16], m.coral, .01);
  const clock = group('墙上时钟', [.3, 5.45, -7.78]);
  cylinder(clock, .66, .66, .12, [0, 0, 0], m.wood).rotation.x = Math.PI / 2;
  cylinder(clock, .57, .57, .025, [0, 0, .075], m.paper).rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    box(clock, [.025, i % 3 ? .055 : .095, .012], [Math.sin(angle) * .47, Math.cos(angle) * .47, .098], m.darkWood, .004).rotation.z = -angle;
  }
  line(clock, [[0, 0, .12], [-.2, .16, .12]], .022, m.ink);
  line(clock, [[0, 0, .12], [.09, .34, .12]], .014, m.ink);
  sphere(clock, [.04, .04, .02], [0, 0, .14], m.coral);

  const garland = group('窗边串灯', [0, 0, -7.52]);
  const cord = [];
  for (let i = 0; i <= 32; i++) {
    const x = -10.5 + i * .5;
    cord.push([x, 7.35 - Math.sin(i / 32 * Math.PI) * .95, 0]);
  }
  line(garland, cord, .018, m.darkWood);
  for (let i = 0; i <= 16; i++) {
    const [x, y, z] = cord[i * 2];
    cylinder(garland, .032, .032, .1, [x, y - .05, z], m.metal);
    sphere(garland, [.07, .095, .07], [x, y - .15, z], m.glow);
  }
  const sill = group('窗台小花园', [-6.5, .64, -7.5]);
  plant(sill, -2.9, 0, 0, .85);
  plant(sill, 2.8, 0, 0, .65);

  // Pet corner and wooden activity gym.
  const bed = group('小狗的布艺睡窝', [7.95, 0, -5.45], -.28);
  box(bed, [4.15, .22, 3.35], [0, .14, 0], m.wood, .1);
  box(bed, [3.7, .36, 2.95], [0, .39, 0], m.fabric, .17);
  box(bed, [4.0, .72, .5], [0, .72, -1.4], m.coral, .22);
  for (const x of [-1.77, 1.77]) box(bed, [.5, .65, 2.8], [x, .68, 0], m.coral, .22);
  // Raised piping follows the cushion perimeter; soft surfaces have actual volume.
  line(bed, [[-1.46, .48, 1.44], [-1.73, .48, 1.24], [-1.73, .48, -1.22], [-1.46, .48, -1.44], [1.46, .48, -1.44], [1.73, .48, -1.22], [1.73, .48, 1.24], [1.46, .48, 1.44], [-1.46, .48, 1.44]], .018, m.cream);
  box(bed, [1.14, .08, 2.35], [.45, .61, .25], m.teal, .04);
  box(bed, [1.14, .40, .08], [.45, .43, 1.52], m.teal, .035);
  for (let i = 0; i < 8; i++) line(bed, [[-.03 + i * .135, .25, 1.53], [-.03 + i * .135, .14, 1.55]], .012, m.fabric);
  const bone = (root, x, y, z, scale = 1) => {
    box(root, [1.05 * scale, .24 * scale, .27 * scale], [x, y, z], m.cream, .1 * scale);
    for (const side of [-1, 1]) for (const end of [-1, 1]) sphere(root, [.22 * scale, .16 * scale, .2 * scale], [x + side * .5 * scale, y, z + end * .12 * scale], m.cream);
  };
  bone(bed, -.58, .75, -.63, .8);

  const gym = group('小狗玩具架', [-9.0, 0, .5], -.3);
  box(gym, [1.42, .12, 1.23], [0, .06, 0], m.wood, .12);
  cylinder(gym, .16, .16, 1.86, [0, 1.04, 0], m.fabric);
  for (let i = 0; i < 22; i++) ring(gym, .162, .018, [0, .22 + i * .075, 0], m.wood).rotation.x = Math.PI / 2;
  box(gym, [1.35, .12, .85], [0, 2.04, 0], m.wood, .1);
  box(gym, [1.22, .1, .76], [0, 2.15, 0], m.fabric, .1);
  line(gym, [[.51, 2.03, .25], [.51, 1.58, .25], [.57, 1.31, .25]], .014, m.darkWood);
  sphere(gym, [.14, .19, .14], [.57, 1.18, .25], m.coral);

  const bowls = group('双碗小餐台', [-6.4, 0, -4.15], .4);
  box(bowls, [1.5, .16, .75], [0, .15, 0], m.wood, .1);
  for (const [x, material] of [[-.39, m.water], [.39, m.darkWood]]) {
    cylinder(bowls, .29, .23, .18, [x, .3, 0], m.cream);
    cylinder(bowls, .235, .235, .012, [x, .395, 0], material);
    ring(bowls, .27, .036, [x, .4, 0], m.cream).rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 7; i++) sphere(bowls, [.045, .035, .04], [.39 + Math.cos(i * 2.4) * .13, .42, Math.sin(i * 2.4) * .13], m.mustard);

  const cart = group('玩具收纳推车', [9.2, 0, .1], -.12);
  for (const x of [-.62, .62]) for (const z of [-.4, .4]) {
    cylinder(cart, .11, .11, .1, [x, .13, z], m.ink).rotation.z = Math.PI / 2;
    cylinder(cart, .035, .035, 1.55, [x, .93, z], m.metal);
  }
  for (const y of [.35, 1.18]) {
    box(cart, [1.5, .08, 1.0], [0, y, 0], m.wood, .06);
    for (const z of [-.48, .48]) box(cart, [1.5, .24, .055], [0, y + .14, z], m.mint, .025);
    for (const x of [-.72, .72]) box(cart, [.055, .24, .95], [x, y + .14, 0], m.mint, .025);
  }
  line(cart, [[-.65, 1.6, -.4], [-.65, 1.92, -.4], [.65, 1.92, -.4], [.65, 1.6, -.4]], .035, m.metal);
  bear(cart, -.29, 1.24, .05, .52);
  // Stacking rings.
  cylinder(cart, .31, .31, .05, [.35, 1.27, .07], m.cream);
  cylinder(cart, .035, .035, .67, [.35, 1.62, .07], m.wood);
  [m.coral, m.mustard, m.blue, m.mint].forEach((color, i) => {
    ring(cart, .23 - i * .04, .055, [.35, 1.37 + i * .115, .07], color).rotation.x = Math.PI / 2;
  });
  for (let i = 0; i < 3; i++) box(cart, [.37, .37, .38], [-.44 + i * .43, .58, .02], [m.coral, m.mustard, m.blue][i], .045).rotation.y = i * .2;

  const basket = group('毛线与玩具篮', [8.9, 0, 5.1], -.5);
  cylinder(basket, .72, .57, .6, [0, .33, 0], m.fabric);
  for (let i = 0; i < 7; i++) ring(basket, .59 + i * .02, .024, [0, .08 + i * .087, 0], m.wood).rotation.x = Math.PI / 2;
  for (const x of [-.67, .67]) ring(basket, .16, .035, [x, .7, 0], m.wood).rotation.y = Math.PI / 2;
  const yarn = (x, y, z, color) => {
    sphere(basket, [.29, .29, .29], [x, y, z], color);
    for (let i = 0; i < 4; i++) {
      const thread = ring(basket, .285, .012, [x, y, z], m.paper);
      thread.rotation.set(i * .7, i * .8, .3);
    }
  };
  yarn(-.29, .62, .01, m.coral);
  yarn(.23, .64, .03, m.blue);
  yarn(.02, .78, -.23, m.mustard);
  yarn(-.72, .29, .67, m.mint);
  line(basket, [[-.72, .03, .84], [-1.04, .026, 1.06], [-.52, .026, 1.31], [-.13, .026, 1.05]], .015, m.mint);

  const train = group('木质小火车', [-4.3, 0, 6.8], -.5);
  for (const z of [-.26, .26]) box(train, [3.8, .04, .045], [0, .055, z], m.darkWood, .008);
  for (let i = 0; i < 12; i++) box(train, [.09, .045, .8], [-1.76 + i * .32, .028, 0], m.wood, .008);
  for (let i = 0; i < 3; i++) {
    const x = -1.14 + i * 1.06;
    box(train, [.86, .16, .55], [x, .24, 0], m.wood, .035);
    for (const dx of [-.28, .28]) for (const z of [-.3, .3]) cylinder(train, .14, .14, .08, [x + dx, .18, z], m.ink).rotation.x = Math.PI / 2;
    if (i === 0) {
      cylinder(train, .2, .2, .48, [x - .13, .48, 0], m.coral).rotation.z = Math.PI / 2;
      box(train, [.32, .46, .51], [x + .24, .51, 0], m.blue, .04);
      box(train, [.44, .07, .64], [x + .24, .79, 0], m.mustard, .03);
      cylinder(train, .065, .065, .22, [x - .25, .7, 0], m.ink);
    } else {
      box(train, [.76, .23, .54], [x, .43, 0], i === 1 ? m.mint : m.mustard, .04);
      sphere(train, [.23, .23, .23], [x, .68, 0], i === 1 ? m.pink : m.blue);
    }
    if (i < 2) line(train, [[x + .43, .2, 0], [x + .63, .2, 0]], .025, m.darkWood);
  }
  const blocks = group('积木小城堡', [-7.5, 0, 4.5], .25);
  for (const x of [-.4, .4]) {
    box(blocks, [.45, .58, .46], [x, .3, 0], m.mint, .025);
    cylinder(blocks, 0, .36, .36, [x, .77, 0], m.coral);
  }
  box(blocks, [.44, .32, .4], [0, .18, 0], m.mustard, .025);
  box(blocks, [1.23, .18, .44], [0, .59, 0], m.blue, .025);
  box(blocks, [.3, .3, .3], [.76, .16, .35], m.coral, .025).rotation.y = .3;

  // Static furniture stays present from every angle in the closed room.
  // Bake only static meshes; real lights remain children of their furniture.
  for (const root of groups) {
    const buckets = new Map();
    for (const mesh of [...root.children]) {
      if (!mesh.isMesh) continue;
      mesh.updateMatrix();
      const transformed = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      transformed.applyMatrix4(mesh.matrix);
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(transformed);
      root.remove(mesh);
      if (!sharedGeometries.has(mesh.geometry)) mesh.geometry.dispose();
    }
    for (const [material, geometries] of buckets) {
      const merged = mergeGeometries(geometries);
      geometries.forEach(geo => geo.dispose());
      const mesh = add(root, merged, material, [0, 0, 0]);
      // Small luminous bulbs need no shadow map footprint.
      if (material === m.glow) mesh.castShadow = false;
    }
  }
  geometryCache.forEach(geo => geo.dispose());
  return {
    groups,
    setNight(night) {
      m.glow.emissiveIntensity = night ? 2.3 : .18;
      lights.forEach(light => { light.intensity = night ? 9 : 0; });
    }
  };
}
