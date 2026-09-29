import * as THREE from '../lib/pet/three.module.js';
import { RoundedBoxGeometry } from '../lib/pet/RoundedBoxGeometry.js';
import { mergeGeometries } from '../lib/pet/BufferGeometryUtils.js';
import { roomMaterial } from './materials.js';

// A shared, locally drawn print atlas keeps the little gallery crisp and cheap.
// All decorations sit above the wainscot, outside the companion's floor routes.
export function createDecor(stage, anisotropy) {
  const root = new THREE.Group();
  root.name = '博客灵感墙与手作装饰';
  stage.add(root);
  const mat = color => new THREE.MeshStandardMaterial({ color, roughness: .8 });
  const m = {
    wood: roomMaterial('oak', 0xffffff, [1, 1], anisotropy), cream: mat(0xffefcf),
    coral: mat(0xd99d8a), green: mat(0x718e77), mint: mat(0xb3c6a5),
    gold: mat(0xe7ba65), ink: mat(0x4b6057), pink: mat(0xe4b6b0),
    cork: roomMaterial('linen', 0xb88e65, [4, 3], anisotropy),
    glow: new THREE.MeshStandardMaterial({ color: 0xffe2ab, emissive: 0xffc477, emissiveIntensity: .15, roughness: .6 })
  };
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = 2048;
  const ctx = atlas.getContext('2d');
  const map = new THREE.CanvasTexture(atlas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = anisotropy;
  const printMaterial = new THREE.MeshStandardMaterial({ map, roughness: .95 });
  const prints = [];
  const lettering = new Set();
  const add = (parent, geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (parent, size, position, material, radius = .025) => add(parent, new RoundedBoxGeometry(...size, 2, radius), material, position);
  const ball = (parent, size, position, material) => {
    const mesh = add(parent, new THREE.SphereGeometry(1, 16, 10), material, position);
    mesh.scale.set(...size);
    return mesh;
  };
  const line = (parent, points, radius, material) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 32, radius, 6, false), material, [0, 0, 0]);
  const group = (position, angle = 0) => {
    const g = new THREE.Group();
    g.position.set(...position);
    g.rotation.y = angle;
    root.add(g);
    return g;
  };
  const text = (c, label, x, y, size, color = '#304a42', weight = 500) => {
    lettering.add(label);
    c.fillStyle = color;
    c.font = `${weight} ${size}px "LXGW WenKai", "Microsoft YaHei", sans-serif`;
    c.textAlign = 'center';
    c.fillText(label, x, y);
  };
  const circle = (c, x, y, r, color) => {
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  };
  const star = (c, x, y, r, color) => {
    c.fillStyle = color; c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2, s = i % 2 ? r * .46 : r;
      c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    }
    c.closePath(); c.fill();
  };
  const flower = (c, x, y, r) => {
    for (let i = 0; i < 6; i++) circle(c, x + Math.cos(i * Math.PI / 3) * r, y + Math.sin(i * Math.PI / 3) * r, r * .63, '#fff9e9');
    circle(c, x, y, r * .58, '#e7ba65');
  };
  const paper = (parent, width, height, position, draw, angle = 0, frame = false) => {
    const g = new THREE.Group(); g.position.set(...position); g.rotation.z = angle; parent.add(g);
    box(g, [width + (frame ? .14 : 0), height + (frame ? .14 : 0), frame ? .10 : .025], [0, 0, 0], frame ? m.wood : m.cream);
    const index = prints.length;
    prints.push({ aspect: width / height, draw });
    const geometry = new THREE.PlaneGeometry(width - .025, height - .025);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, ((index % 4) * 512 + 8 + uv.getX(i) * 496) / 2048,
        1 - (Math.floor(index / 4) * 512 + 8 + (1 - uv.getY(i)) * 496) / 2048);
    }
    const mesh = add(g, geometry, printMaterial, [0, 0, frame ? .056 : .017]);
    mesh.castShadow = false;
    return g;
  };

  // Left wall: pinboard, four illustrated subjects, brass pins and paper tape.
  const board = group([-11.30, 4.75, -2.65], Math.PI / 2);
  box(board, [5.25, 3.55, .16], [0, 0, 0], m.wood, .07);
  box(board, [5.00, 3.29, .03], [0, 0, .095], m.cork, .045);
  paper(board, 4.2, .64, [0, 1.23, .15], (c, h) => {
    text(c, '十七的灵感墙', 256, h * .63, 45);
    star(c, 52, h / 2, 15, '#d8a74d'); star(c, 460, h / 2, 15, '#d8a74d');
  });
  const subjects = [
    { title: 'Java 安全', sub: '反序列化 · CC 链', bg: '#e4ecda', color: '#76937e', kind: 'shield' },
    { title: 'LangChain', sub: '把灵感串成小宇宙', bg: '#f3e0cc', color: '#c78e73', kind: 'chain' },
    { title: 'RAG', sub: '知识库里的小星光', bg: '#e0e8ee', color: '#7f9fb6', kind: 'book' },
    { title: 'Vibe Coding', sub: '让好奇心慢慢发芽', bg: '#f3e2e1', color: '#c8979d', kind: 'code' }
  ];
  subjects.forEach((subject, i) => {
    const x = -1.68 + i * 1.12, y = -.27 + (i % 2 ? -.12 : .06);
    const card = paper(board, 1.02, 1.92, [x, y, .17], (c, h) => {
      c.fillStyle = subject.bg; c.fillRect(0, 0, 512, h);
      text(c, `0${i + 1} / NOTES`, 256, 85, 28, subject.color);
      circle(c, 256, 285, 126, '#fff8ec');
      c.strokeStyle = subject.color; c.lineWidth = 16; c.lineCap = 'round'; c.lineJoin = 'round';
      if (subject.kind === 'shield') {
        c.beginPath(); c.moveTo(256, 190); c.lineTo(330, 223); c.lineTo(318, 310); c.quadraticCurveTo(300, 356, 256, 375); c.quadraticCurveTo(208, 354, 194, 310); c.lineTo(182, 223); c.closePath(); c.stroke();
        c.beginPath(); c.moveTo(225, 284); c.lineTo(249, 309); c.lineTo(288, 260); c.stroke();
      } else if (subject.kind === 'chain') {
        for (const [cx, cy] of [[225, 258], [288, 317]]) { c.beginPath(); c.ellipse(cx, cy, 53, 35, -.75, 0, Math.PI * 2); c.stroke(); }
      } else if (subject.kind === 'book') {
        c.beginPath(); c.moveTo(256, 239); c.quadraticCurveTo(211, 211, 173, 235); c.lineTo(173, 346); c.quadraticCurveTo(217, 325, 256, 351); c.quadraticCurveTo(295, 325, 339, 346); c.lineTo(339, 235); c.quadraticCurveTo(295, 211, 256, 239); c.lineTo(256, 351); c.stroke();
        star(c, 321, 180, 22, '#d8ac58');
      } else text(c, '</>', 256, 320, 100, subject.color);
      text(c, subject.title, 256, 506, subject.title.length > 9 ? 62 : 72);
      text(c, subject.sub, 256, 581, 31);
      flower(c, 256, h - 124, 31);
    }, [-.055, .045, -.025, .06][i]);
    box(card, [.36, .13, .018], [0, .95, .04], i % 2 ? m.mint : m.pink, .008);
    ball(board, [.045, .045, .025], [x, y + 1.04, .26], m.gold);
  });

  // The gouache print by the shelf is too large for a 512px atlas cell, so it owns a texture.
  const art = group([3.85, 4.75, -7.92]);
  const artFrame = new THREE.Group(); artFrame.position.z = .08; artFrame.rotation.z = -.025; art.add(artFrame);
  box(artFrame, [2.34, 3.09, .10], [0, 0, 0], m.wood);
  box(artFrame, [2.2, 2.95, .02], [0, 0, .045], m.cream);
  const artMap = new THREE.TextureLoader().load('/img/pet-room/paws-art-print.webp');
  artMap.colorSpace = THREE.SRGBColorSpace;
  const artMaterial = new THREE.MeshStandardMaterial({ map: artMap, roughness: .9 });
  add(artFrame, new THREE.PlaneGeometry(1.98, 2.73), artMaterial, [0, 0, .058]);

  const postcards = group([-11.28, 5.2, 3.5], Math.PI / 2);
  line(postcards, [[-2.05, .98, .07], [-.8, .65, .12], [.7, .61, .12], [2.0, 1.02, .07]], .014, m.ink);
  ['把日子写成诗', '保持好奇', '今日也有小确幸'].forEach((label, i) => {
    const card = paper(postcards, 1.0, 1.28, [-1.38 + i * 1.38, -.15 + (i === 1 ? -.2 : 0), .15], (c, h) => {
      c.fillStyle = ['#dce6d5', '#eadac8', '#e6dfe9'][i]; c.fillRect(32, 30, 448, 435);
      if (i === 0) { circle(c, 354, 132, 47, '#f5d58f'); flower(c, 210, 284, 63); }
      if (i === 1) { text(c, '{ }', 256, 260, 140); star(c, 372, 120, 29, '#d9a759'); }
      if (i === 2) { circle(c, 256, 229, 95, '#fff5dc'); circle(c, 231, 216, 7, '#596653'); circle(c, 284, 216, 7, '#596653'); c.strokeStyle = '#596653'; c.lineWidth = 6; c.beginPath(); c.arc(256, 237, 28, .2, Math.PI - .2); c.stroke(); }
      text(c, label, 256, h - 61, 34);
    }, [-.09, .05, -.06][i]);
    box(card, [.08, .25, .07], [0, .65, .06], m.wood, .01);
  });

  // A cloud ledge and a daisy above the bed balance the technical pinboard.
  const nook = group([8.1, 5.75, -7.92]);
  for (const [x, y, s] of [[-.72, 0, .47], [-.25, .22, .62], [.4, .15, .53], [.86, -.03, .35]]) ball(nook, [s, s * .74, .09], [x, y, .13], m.cream);
  paper(nook, 1.4, .38, [.05, .0, .235], (c, h) => text(c, '做个甜甜的梦', 256, h * .69, 49));
  for (const [x, length] of [[-.72, .68], [.05, .95], [.77, .58]]) {
    line(nook, [[x, -.32, .13], [x, -.32 - length, .13]], .012, m.gold);
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .1 : .22;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    add(nook, new THREE.ExtrudeGeometry(shape, { depth: .04, bevelEnabled: true, bevelThickness: .016, bevelSize: .014, bevelSegments: 2 }), m.glow, [x, -.47 - length, .14]);
  }
  const daisy = group([6.0, 6.3, -7.95]);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    const petal = ball(daisy, [.16, .31, .07], [Math.sin(a) * .3, Math.cos(a) * .3, .12], m.cream);
    petal.rotation.z = -a;
  }
  ball(daisy, [.2, .2, .10], [0, 0, .17], m.gold);

  // Right wall and the return wall have details when the room is orbited, too.
  const shelf = group([11.24, 4.2, -2.15], -Math.PI / 2);
  box(shelf, [4.1, .13, .65], [0, 0, .22], m.wood);
  for (const x of [-1.48, 1.48]) line(shelf, [[x, -.5, .03], [x, -.04, .48], [x, -.04, .03]], .035, m.gold);
  paper(shelf, 1.23, 1.65, [-.84, .89, .14], (c, h) => {
    text(c, 'BUILD', 256, 147, 72); text(c, 'WITH', 256, 257, 64); text(c, 'LOVE', 256, 367, 72, '#c38e7c');
    flower(c, 256, h - 145, 48);
  }, -.05, true);
  paper(shelf, 1.16, 1.32, [.69, .73, .12], (c, h) => {
    circle(c, 256, 203, 102, '#dfe8d4'); text(c, 'AI', 256, 236, 87); text(c, '小小想法，大大世界', 256, h - 78, 30);
  }, .06, true);
  for (const side of [-1, 1]) {
    const x = side * 1.73;
    add(shelf, new THREE.CylinderGeometry(.19, .14, .3, 20), m.coral, [x, .22, .25]);
    for (let i = 0; i < 7; i++) {
      const y = .40 - i * .15, xx = x + Math.sin(i * 1.9) * .13;
      ball(shelf, [.14, .08, .035], [xx, y, .46], i % 2 ? m.green : m.mint).rotation.z = i * .8;
      if (i) line(shelf, [[x, y + .2, .40], [xx, y, .45]], .012, m.green);
    }
  }
  const welcome = group([0, 4.7, 10.27], Math.PI);
  paper(welcome, 4.8, 1.52, [0, 0, .05], (c, h) => {
    text(c, '十七的小小宇宙', 256, 65, 43);
    text(c, '记录 · 分享 · 热爱', 256, 109, 24, '#9b9279');
    flower(c, 42, 77, 14); flower(c, 470, 77, 14);
  }, 0, true);
  for (const x of [-3.5, 3.5]) {
    const flowerGroup = group([x, 4.75, 10.25], Math.PI);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ball(flowerGroup, [.22, .22, .055], [Math.cos(a) * .29, Math.sin(a) * .29, .09], m.cream);
    }
    ball(flowerGroup, [.18, .18, .08], [0, 0, .16], m.gold);
  }

  const drawPrints = () => {
    ctx.clearRect(0, 0, 2048, 2048);
    prints.forEach(({ aspect, draw }, i) => {
      ctx.save(); ctx.translate(i % 4 * 512, Math.floor(i / 4) * 512);
      ctx.fillStyle = '#fff8e9'; ctx.fillRect(0, 0, 512, 512);
      ctx.translate(8, 8); ctx.scale(496 / 512, 496 / 512 * aspect);
      ctx.beginPath(); ctx.rect(0, 0, 512, 512 / aspect); ctx.clip();
      draw(ctx, 512 / aspect); ctx.restore();
    });
    map.needsUpdate = true;
  };
  drawPrints();
  // Canvas text does not repaint itself when a self-hosted CJK subset arrives.
  if (document.fonts) document.fonts.load('500 48px "LXGW WenKai"', [...lettering].join('')).then(drawPrints).catch(() => {});

  const cameraBounds = root.children.map(child => new THREE.Box3().setFromObject(child));
  const buckets = new Map();
  root.updateWorldMatrix(true, true);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
    buckets.get(mesh.material).push(geometry);
    mesh.geometry.dispose();
  });
  root.clear();
  for (const [material, geometries] of buckets) {
    const mesh = add(root, mergeGeometries(geometries), material, [0, 0, 0]);
    mesh.castShadow = material !== printMaterial && material !== artMaterial && material !== m.glow;
    geometries.forEach(geometry => geometry.dispose());
  }
  return { cameraBounds, setNight(night) { m.glow.emissiveIntensity = night ? 2.2 : .15; } };
}
