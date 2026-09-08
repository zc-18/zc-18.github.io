import * as THREE from '../lib/pet/three.module.js';
import { RoundedBoxGeometry } from '../lib/pet/RoundedBoxGeometry.js';
import { mergeGeometries } from '../lib/pet/BufferGeometryUtils.js';
import { createFurnishings } from './furnishings.js';
import { roomMaterial } from './materials.js';

export const ROOM = Object.freeze({ minX: -11.5, maxX: 11.5, minZ: -8.2, maxZ: 10.5, height: 8.6 });

const rounded = (width, height, radius) => {
  const shape = new THREE.Shape(), x = -width / 2;
  shape.moveTo(x + radius, 0);
  shape.lineTo(x + width - radius, 0);
  shape.quadraticCurveTo(x + width, 0, x + width, radius);
  shape.lineTo(x + width, height - radius);
  shape.quadraticCurveTo(x + width, height, x + width - radius, height);
  shape.lineTo(x + radius, height);
  shape.quadraticCurveTo(x, height, x, height - radius);
  shape.lineTo(x, radius);
  shape.quadraticCurveTo(x, 0, x + radius, 0);
  return shape;
};

export function createStudio(stage, renderer) {
  stage.name = 'enclosed-puppy-room';
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const architecture = new THREE.Group();
  architecture.name = 'four-walls-and-ceiling';
  stage.add(architecture);
  const white = new THREE.MeshStandardMaterial({ color: 0xf4e9d6, roughness: .64 });
  const wallMaterial = roomMaterial('plaster', 0xf1e4d0, [5, 2], anisotropy);
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x9eafa0, roughness: .74 });
  const oak = roomMaterial('oak', 0xffffff, [1, 1], anisotropy);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb98b50, metalness: .72, roughness: .3 });
  const linen = roomMaterial('linen', 0xead8be, [2, 5], anisotropy, { side: THREE.DoubleSide });
  const add = (geometry, material, position, parent = architecture) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (size, position, material, radius = .035, parent = architecture) => add(new RoundedBoxGeometry(...size, 2, radius), material, position, parent);
  const tube = (points, radius, material, parent = architecture) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 48, radius, 8, false), material, [0, 0, 0], parent);

  // Real thickness, continuous corners, front wall and ceiling. Orbit never hides geometry.
  const width = ROOM.maxX - ROOM.minX, depth = ROOM.maxZ - ROOM.minZ, centerZ = (ROOM.maxZ + ROOM.minZ) / 2;
  const floorMaterial = roomMaterial('oak', 0xfff4df, [6, 3], anisotropy);
  const floor = add(new THREE.PlaneGeometry(width + .3, depth + .3), floorMaterial, [0, -.025, centerZ]);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const wall = new THREE.Shape();
  wall.moveTo(ROOM.minX - .3, 0); wall.lineTo(ROOM.maxX + .3, 0);
  wall.lineTo(ROOM.maxX + .3, ROOM.height + .2); wall.lineTo(ROOM.minX - .3, ROOM.height + .2); wall.closePath();
  wall.holes.push(new THREE.Path(rounded(8.15, 6.45, 1.58).getPoints(48).map(p => p.add(new THREE.Vector2(-6.5, .45)))));
  const back = add(new THREE.ExtrudeGeometry(wall, { depth: .3, bevelEnabled: false, curveSegments: 48 }), wallMaterial, [0, 0, ROOM.minZ - .3]);
  const uv = back.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / width, uv.getY(i) / ROOM.height);
  box([width + .6, ROOM.height, .3], [0, ROOM.height / 2, ROOM.maxZ + .15], wallMaterial);
  for (const x of [ROOM.minX - .15, ROOM.maxX + .15]) box([.3, ROOM.height, depth + .6], [x, ROOM.height / 2, centerZ], wallMaterial);
  box([width + .6, .24, depth + .6], [0, ROOM.height + .12, centerZ], white);

  // Tongue-and-groove panels, skirting and layered crown moulding.
  for (const z of [ROOM.minZ + .055, ROOM.maxZ - .055]) {
    const front = z > 0;
    box([width, front ? 2.1 : .38, .09], [0, front ? 1.05 : .19, z], panelMaterial);
    if (front) for (let x = -11; x <= 11; x += 1.1) box([.055, 2.05, .12], [x, 1.05, z - .055], white, .012);
    for (const [height, size] of [[.12, .22], [ROOM.height - .15, .2], [ROOM.height - .38, .10]]) box([width, size, .20], [0, height, z], white);
    if (front) box([width, .1, .2], [0, 2.15, z], white);
  }
  for (const side of [-1, 1]) {
    const x = side * (ROOM.maxX - .055);
    box([.09, 2.1, depth], [x, 1.05, centerZ], panelMaterial);
    for (let z = -7.65; z < 10; z += 1.05) box([.12, 2.05, .045], [x - side * .055, 1.05, z], white, .012);
    for (const [height, size] of [[.12, .22], [2.15, .1], [ROOM.height - .15, .2], [ROOM.height - .38, .10]]) box([.20, size, depth], [x, height, centerZ], white);
  }

  const windowGroup = new THREE.Group();
  windowGroup.position.set(-6.5, .45, ROOM.minZ + .08);
  architecture.add(windowGroup);
  const frame = rounded(8.2, 6.5, 1.6);
  frame.holes.push(new THREE.Path(rounded(7.65, 5.94, 1.34).getPoints(48).map(p => p.add(new THREE.Vector2(0, .28)))));
  add(new THREE.ExtrudeGeometry(frame, { depth: .24, bevelEnabled: true, bevelSize: .045, bevelThickness: .04, bevelSegments: 3, curveSegments: 48 }), white, [0, 0, 0], windowGroup);
  const garden = new THREE.TextureLoader().load('/img/pet-garden.webp');
  garden.colorSpace = THREE.SRGBColorSpace;
  garden.anisotropy = anisotropy;
  const viewMaterial = new THREE.MeshBasicMaterial({ map: garden, color: 0xffffff });
  const viewGeometry = new THREE.ShapeGeometry(rounded(7.9, 6.2, 1.4), 48);
  const position = viewGeometry.attributes.position, viewUV = viewGeometry.attributes.uv;
  for (let i = 0; i < position.count; i++) viewUV.setXY(i, position.getX(i) / 7.9 + .5, position.getY(i) / 6.2);
  const view = add(viewGeometry, viewMaterial, [0, .13, -.14], windowGroup);
  view.castShadow = view.receiveShadow = false;
  for (const x of [-1.28, 1.28]) box([.065, 5.85, .16], [x, 3.24, .18], white, .025, windowGroup);
  box([7.69, .065, .16], [0, 2.2, .18], white, .025, windowGroup);
  box([8.48, .17, .83], [0, .09, .15], white, .06, windowGroup);
  box([.05, .3, .045], [1.42, 2.63, .29], brass, .02, windowGroup);

  // Pleats are real geometry; restrained hem motion stays clear of the frame.
  const curtains = [];
  tube([[-11, 7.3, -7.3], [-6.5, 7.3, -7.3], [-2, 7.3, -7.3]], .035, brass);
  for (const side of [-1, 1]) {
    const geometry = new THREE.PlaneGeometry(1.18, 6.5, 24, 48);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i);
      vertices.setXYZ(i, x * (1 - .16 * Math.sin((y / 6.5 + .5) * Math.PI)), y, Math.cos((x / 1.18 + .5) * Math.PI * 12) * .10);
    }
    geometry.computeVertexNormals();
    const curtain = add(geometry, linen, [-6.5 + side * 3.95, 3.91, -7.22], stage);
    curtains.push({ mesh: curtain, rest: vertices.array.slice() });
    for (let i = 0; i < 7; i++) {
      const ring = add(new THREE.TorusGeometry(.068, .013, 8, 16), brass, [-6.5 + side * 3.95 - .51 + i * .17, 7.27, -7.3]);
      ring.rotation.y = Math.PI / 2;
    }
    box([1.0, .09, .26], [-6.5 + side * 3.95, 2.45, -7.15], oak);
  }

  const rugMaterial = roomMaterial('linen', 0x92a392, [9, 9], anisotropy);
  const rug = add(new THREE.CylinderGeometry(5.9, 5.9, .018, 128), rugMaterial, [0, -.015, .15]);
  rug.scale.z = .87;
  rug.castShadow = false;
  for (const radius of [5.48, 5.60, 5.75]) {
    const rim = add(new THREE.RingGeometry(radius, radius + .032, 128), white, [0, -.004, .15]);
    rim.rotation.x = -Math.PI / 2; rim.scale.y = .87; rim.castShadow = false;
  }
  const paw = (parent, x, y, z, scale, material, floorFacing = false) => {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    if (floorFacing) group.rotation.x = -Math.PI / 2;
    parent.add(group);
    for (const [px, py, sx, sy] of [[0, -.13, .22, .18], [-.27, .11, .10, .14], [-.1, .27, .10, .14], [.1, .27, .10, .14], [.27, .11, .10, .14]]) {
      const pad = add(new THREE.SphereGeometry(1, 24, 16), material, [px * scale, py * scale, 0], group);
      pad.scale.set(sx * scale, sy * scale, floorFacing ? .002 : .02);
      pad.castShadow = false;
    }
  };
  paw(architecture, 0, -.001, 3.8, 1.4, white, true);

  // Closed oak door with panels, architrave, handle and hinges.
  const door = new THREE.Group();
  door.position.set(11.22, 0, 5.9); door.rotation.y = -Math.PI / 2;
  architecture.add(door);
  box([2.9, 6.15, .17], [0, 3.075, 0], oak, .05, door);
  for (const x of [-1.55, 1.55]) box([.18, 6.3, .25], [x, 3.15, .03], white, .025, door);
  box([3.28, .18, .25], [0, 6.34, .03], white, .025, door);
  for (const y of [1.4, 4.35]) {
    box([2.32, 2.25, .05], [0, y, .11], panelMaterial, .045, door);
    box([2.12, 2.05, .05], [0, y, .15], oak, .035, door);
  }
  box([.14, .4, .06], [1.08, 2.87, .17], brass, .04, door);
  tube([[1.08, 2.97, .22], [1.08, 2.97, .35], [.76, 2.97, .36]], .044, brass, door);
  for (const y of [.65, 3, 5.6]) box([.08, .22, .10], [-1.45, y, .13], brass, .02, door);

  box([3.35, .86, .12], [7.9, 3, -8.02], oak, .14);
  const sign = document.createElement('canvas');
  sign.width = 1024; sign.height = 256;
  const ctx = sign.getContext('2d');
  ctx.fillStyle = '#efe3c9'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#665640'; ctx.font = '500 70px Georgia, serif'; ctx.textAlign = 'center';
  ctx.fillText('little paws, happy home', 512, 124);
  ctx.font = '28px Georgia, serif'; ctx.fillText('S H I Q I   /   N o . 1 7', 512, 187);
  const signMap = new THREE.CanvasTexture(sign); signMap.colorSpace = THREE.SRGBColorSpace; signMap.anisotropy = anisotropy;
  add(new THREE.PlaneGeometry(3.12, .7), new THREE.MeshStandardMaterial({ map: signMap, roughness: 1 }), [7.9, 3, -7.952]);
  paw(architecture, 7.9, 4.2, -8, 1.45, panelMaterial);

  const furnishings = createFurnishings(stage, anisotropy);
  tube([[1.8, 8.57, 1.4], [1.8, 7.4, 1.4]], .022, brass);
  const shade = add(new THREE.CylinderGeometry(.65, 1, .76, 64, 1, true), linen, [1.8, 7.1, 1.4]);
  shade.castShadow = false;
  const glow = new THREE.MeshStandardMaterial({ color: 0xffe8bc, emissive: 0xffc276, emissiveIntensity: 1.2, roughness: .7, side: THREE.DoubleSide });
  const diffuser = add(new THREE.CircleGeometry(.91, 64), glow, [1.8, 6.73, 1.4]);
  diffuser.rotation.x = Math.PI / 2; diffuser.castShadow = false;
  const warmLight = new THREE.PointLight(0xffcd92, 18, 25, 2);
  warmLight.position.set(1.8, 6.45, 1.4); stage.add(warmLight);

  const contactCanvas = document.createElement('canvas');
  contactCanvas.width = contactCanvas.height = 256;
  const contactCtx = contactCanvas.getContext('2d');
  const gradient = contactCtx.createRadialGradient(128, 128, 12, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(53,38,22,.25)'); gradient.addColorStop(.55, 'rgba(53,38,22,.10)'); gradient.addColorStop(1, 'rgba(53,38,22,0)');
  contactCtx.fillStyle = gradient; contactCtx.fillRect(0, 0, 256, 256);
  const contact = add(new THREE.PlaneGeometry(2.8, 2.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, depthWrite: false }), [0, .006, 0], stage);
  contact.rotation.x = -Math.PI / 2; contact.castShadow = contact.receiveShadow = false;

  stage.updateWorldMatrix(true, true);
  const boxes = furnishings.groups.filter(root => !['墙面画廊', '墙上时钟', '窗边串灯', '窗台小花园'].includes(root.name)).map(root => ({ name: root.name, box: new THREE.Box3().setFromObject(root) }));
  const physicalWalls = [
    { size: [width + .6, ROOM.height, .3], position: [0, ROOM.height / 2, ROOM.minZ - .15] },
    { size: [width + .6, ROOM.height, .3], position: [0, ROOM.height / 2, ROOM.maxZ + .15] },
    ...[-1, 1].map(side => ({ size: [.3, ROOM.height, depth], position: [side * (ROOM.maxX + .15), ROOM.height / 2, centerZ] })),
    { size: [width, .3, depth], position: [0, ROOM.height + .15, centerZ] }
  ];

  // Bake static architecture by material; cloth and real lights retain their own objects.
  const buckets = new Map();
  architecture.updateWorldMatrix(true, true);
  architecture.traverse(mesh => {
    if (!mesh.isMesh) return;
    const key = mesh.material.uuid + '/' + mesh.castShadow + '/' + mesh.receiveShadow;
    if (!buckets.has(key)) buckets.set(key, { material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, geometries: [] });
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    buckets.get(key).geometries.push(geometry);
    mesh.geometry.dispose();
  });
  architecture.clear();
  for (const { material, cast, receive, geometries } of buckets.values()) {
    const mesh = add(mergeGeometries(geometries), material, [0, 0, 0]);
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    geometries.forEach(geometry => geometry.dispose());
  }

  const cameraBounds = [...boxes.map(({ box }) => box.clone()), ...curtains.map(({ mesh }) => new THREE.Box3().setFromObject(mesh)), new THREE.Box3(new THREE.Vector3(.8, 6.7, .4), new THREE.Vector3(2.8, 7.5, 2.4))].map(box => box.expandByScalar(.35));
  const constrainCamera = camera => {
    const p = camera.position;
    const clampRoom = () => {
      p.x = THREE.MathUtils.clamp(p.x, ROOM.minX + .75, ROOM.maxX - .75);
      p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ + .55, ROOM.maxZ - .5);
      p.y = THREE.MathUtils.clamp(p.y, .65, ROOM.height - .5);
    };
    clampRoom();
    for (const b of cameraBounds) {
      if (!b.containsPoint(p)) continue;
      // Choose an exit that is also inside the room and clear of adjacent furniture.
      // A nearest-face-only push can put the camera behind a shelf, inside the back wall.
      const candidates = [];
      for (const axis of ['x', 'y', 'z']) for (const sign of [-1, 1]) {
        const candidate = p.clone();
        candidate[axis] = sign < 0 ? b.min[axis] - .015 : b.max[axis] + .015;
        if (candidate.x < ROOM.minX + .75 || candidate.x > ROOM.maxX - .75 || candidate.z < ROOM.minZ + .55 || candidate.z > ROOM.maxZ - .5 || candidate.y < .65 || candidate.y > ROOM.height - .5) continue;
        if (cameraBounds.every(box => !box.containsPoint(candidate))) candidates.push(candidate);
      }
      candidates.sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p));
      if (candidates.length) p.copy(candidates[0]);
      else p.y = Math.min(ROOM.height - .5, Math.max(...cameraBounds.filter(box => box.containsPoint(p)).map(box => box.max.y)) + .015);
    }
    clampRoom();
  };
  return {
    contact, boxes, physicalWalls, floorMaterial,
    updateCamera(camera, target) { constrainCamera(camera); camera.lookAt(target); },
    update(time, reduced) {
      if (reduced) time = 0;
      for (const { mesh, rest } of curtains) {
        const vertices = mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
          const weight = (3.25 - rest[i * 3 + 1]) / 6.5;
          vertices.setZ(i, rest[i * 3 + 2] + Math.sin(time * .7 + rest[i * 3] * 2) * .025 * weight * weight);
        }
        vertices.needsUpdate = true;
      }
    },
    setNight(night) {
      furnishings.setNight(night);
      viewMaterial.color.setHex(night ? 0x465978 : 0xffffff);
      warmLight.intensity = night ? 45 : 18;
      glow.emissiveIntensity = night ? 2.1 : 1.2;
    }
  };
}
