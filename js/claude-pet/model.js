import * as THREE from '../lib/pet/three.module.js';
import { RoundedBoxGeometry } from '../lib/pet/RoundedBoxGeometry.js';
import { mergeVertices } from '../lib/pet/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const power = (value, exponent) => Math.sign(value) * Math.abs(value) ** exponent;

export class RobotCat {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'robot-cat';
    this.geometries = new Map();
    const grain = new THREE.TextureLoader().load('/img/pet-ceramic-roughness.webp');
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.repeat.set(4, 4);
    this.materials = {
      shell: new THREE.MeshPhysicalMaterial({ color: 0xf7fafb, roughness: .30, roughnessMap: grain, metalness: .04, clearcoat: .72, clearcoatRoughness: .25 }),
      blue: new THREE.MeshPhysicalMaterial({ color: 0x3699dc, metalness: .18, roughness: .25, clearcoat: 1, clearcoatRoughness: .16 }),
      trim: new THREE.MeshPhysicalMaterial({ color: 0xb8d6e7, metalness: .65, roughness: .24, clearcoat: .8 }),
      joint: new THREE.MeshStandardMaterial({ color: 0x335773, metalness: .55, roughness: .38 }),
      pad: new THREE.MeshStandardMaterial({ color: 0x70b9df, roughness: .6 }),
      light: new THREE.MeshStandardMaterial({ color: 0xc9f7ff, emissive: 0x37ceff, emissiveIntensity: 1.8, roughness: .22 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x02060a, metalness: 0, roughness: .22, clearcoat: .35, clearcoatRoughness: .28, envMapIntensity: .12 })
    };
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.soft(this.body, [1.36, 1.10, 1.87], [0, 0, -.27], 'shell', .9);
    this.cylinder(this.body, .49, .16, [0, .49, .35], 'blue');
    this.torus(this.body, .477, .018, [0, .572, .35], 'trim', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const seam = this.box(this.body, [.014, .105, .023], [Math.sin(angle) * .49, .49, .35 + Math.cos(angle) * .49], 'joint', .005);
      seam.rotation.y = angle;
    }
    this.torus(this.body, .067, .024, [0, .47, .88], 'blue');
    this.box(this.body, [.052, .17, .05], [0, .335, .92], 'blue', .023);
    this.pendant = new THREE.Group();
    this.pendant.position.set(0, .13, .94);
    this.pendant.rotation.x = -.08;
    this.body.add(this.pendant);
    this.box(this.pendant, [.36, .41, .10], [0, 0, 0], 'trim', .075);
    this.box(this.pendant, [.33, .38, .105], [0, 0, .018], 'shell', .065);
    this.box(this.pendant, [.245, .275, .025], [0, 0, .079], 'blue', .035);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
      this.box(this.pendant, [.047, .049, .012], [x * .068, y * .075, .098], 'light', .006);
    }
    for (let i = 0; i < 4; i++) this.box(this.body, [.29, .026, .035], [0, .19 - i * .075, -1.202], 'joint', .012);

    this.head = new THREE.Group();
    this.head.position.set(0, 2, .10);
    this.root.add(this.head);
    // Continuous inflated surfaces keep the head and display rounded from every viewing angle.
    this.housing();
    this.displaySurface(1.73, 1.20, .625, .092, this.materials.trim);
    this.displaySurface(1.68, 1.155, .65, .076, this.materials.glass);
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 768;
    this.faceCanvas.height = 512;
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceTexture.anisotropy = 4;
    this.faceImages = {};
    for (const mood of ['idle', 'sleep', 'happy']) {
      const image = new Image();
      image.onload = () => { this.lastFace = ''; };
      image.src = '/img/pet-face-' + mood + '.webp';
      this.faceImages[mood] = image;
    }
    const screenMaterial = new THREE.MeshBasicMaterial({ map: this.faceTexture, transparent: true, depthWrite: false, toneMapped: false });
    this.screen = this.displaySurface(1.585, 1.075, .676, .065, screenMaterial);
    this.screen.name = 'curved-display';
    this.box(this.head, [.52, .092, .37], [0, .708, -.04], 'blue', .044);
    this.box(this.head, [.34, .028, .09], [0, .755, .077], 'joint', .014);
    this.box(this.head, [.29, .024, .055], [0, .77, .077], 'light', .012);
    this.soft(this.head, [.73, .48, .07], [0, -.05, -.687], 'blue', .65);
    for (let i = 0; i < 4; i++) this.box(this.head, [.43, .025, .023], [0, .06 - i * .075, -.729], 'joint', .011);
    this.ears = [];
    for (const side of [-1, 1]) {
      this.ear(side);
      const earcup = new THREE.Group();
      earcup.position.set(side * .97, -.015, -.035);
      earcup.rotation.z = -side * Math.PI / 2;
      this.head.add(earcup);
      this.cylinder(earcup, .36, .17, [0, 0, 0], 'trim');
      this.cylinder(earcup, .345, .195, [0, .025, 0], 'blue');
      this.torus(earcup, .309, .022, [0, .129, 0], 'shell', [Math.PI / 2, 0, 0]);
      this.cylinder(earcup, .27, .056, [0, .136, 0], 'shell');
      this.cylinder(earcup, .226, .065, [0, .155, 0], 'blue');
      this.torus(earcup, .209, .009, [0, .191, 0], 'trim', [Math.PI / 2, 0, 0]);
      this.box(this.head, [.05, .20, .067], [side * .982, -.01, .275], 'light', .025);
      const antenna = new THREE.Group();
      antenna.position.set(side * .23, .735, -.12);
      antenna.rotation.z = -side * .19;
      this.head.add(antenna);
      this.cylinder(antenna, .026, .29, [0, .145, 0], 'joint');
      for (let j = 0; j < 4; j++) this.cylinder(antenna, .035, .025, [0, .07 + j * .07, 0], 'trim');
      this.sphere(antenna, .075, [0, .32, 0], 'blue');
      this.sphere(antenna, .037, [-.012, .345, .047], 'light');
    }
    this.head.scale.set(.98, .96, 1);
    this.head.traverse(mesh => { if (mesh.isMesh) mesh.receiveShadow = false; });

    this.legs = [];
    for (const side of [-1, 1]) for (const front of [-1, 1]) {
      const leg = { side, front, x: side * (front === 1 ? .51 : .55), z: front === 1 ? .38 : -.78, phase: side === front ? 0 : Math.PI };
      leg.hip = this.sphere(this.root, .19, [0, 0, 0], 'shell');
      leg.hip.visible = front !== 1;
      leg.upper = this.soft(this.root, [front === 1 ? .445 : .57, front === 1 ? .74 : .65, front === 1 ? .47 : .66], [0, 0, 0], 'shell', .92);
      leg.knee = this.sphere(this.root, front === 1 ? .135 : .166, [0, 0, 0], front === 1 ? 'shell' : 'trim');
      leg.lower = this.soft(this.root, [.38, .54, .42], [0, 0, 0], 'shell', .83);
      leg.foot = new THREE.Group();
      this.root.add(leg.foot);
      this.soft(leg.foot, [.47, .28, .54], [0, .034, .055], 'shell', .88);
      this.soft(leg.foot, [.405, .052, .46], [0, -.086, .048], 'pad', .7);
      for (let i = -1; i <= 1; i++) this.soft(leg.foot, [.050, .115, .058], [i * .125, .005, .306], 'blue', .7);
      this.sphere(leg.foot, .09, [0, -.117, .06], 'blue', [1, .14, 1.05]);
      for (const x of [-.10, 0, .10]) this.sphere(leg.foot, .035, [x, -.115, .19], 'blue', [1, .2, 1]);
      leg.foot.traverse(mesh => { if (mesh.isMesh) mesh.receiveShadow = false; });
      this.legs.push(leg);
    }

    this.tail = [];
    let parent = this.body;
    for (let i = 0; i < 7; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, i ? 0 : -.10, i ? -.215 : -1.14);
      parent.add(pivot);
      const radius = .106 - i * .006;
      this.sphere(pivot, radius * .94, [0, 0, 0], 'blue');
      this.soft(pivot, [radius * 2.05, radius * 2.05, .245], [0, 0, -.105], 'blue', .72);
      this.torus(pivot, radius * .91, .01, [0, 0, -.195], 'trim');
      this.tail.push(pivot);
      parent = pivot;
    }
    this.soft(parent, [.22, .22, .36], [0, 0, -.26], 'shell', 1);
    this.phase = 0;
    this.tailPhase = 0;
    this.lastFace = '';
    this.animate(0, 0, 'idle', 0, false);
  }

  geometry(key, factory) {
    if (!this.geometries.has(key)) this.geometries.set(key, factory());
    return this.geometries.get(key);
  }

  mesh(parent, geometry, position, material) {
    const mesh = new THREE.Mesh(geometry, this.materials[material] || material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(parent, size, position, material, radius = .04) {
    return this.mesh(parent, this.geometry('b' + size + radius, () => new RoundedBoxGeometry(...size, 4, radius)), position, material);
  }

  soft(parent, size, position, material, exponent = .7) {
    const geometry = this.geometry('soft' + size + exponent, () => {
      const large = size[0] > 1.5;
      const geometry = new THREE.SphereGeometry(1, large ? 64 : 32, large ? 40 : 24);
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) vertices.setXYZ(i,
        power(vertices.getX(i), exponent) * size[0] / 2,
        power(vertices.getY(i), exponent) * size[1] / 2,
        power(vertices.getZ(i), exponent) * size[2] / 2);
      geometry.computeVertexNormals();
      return geometry;
    });
    return this.mesh(parent, geometry, position, material);
  }

  sphere(parent, radius, position, material, scale) {
    const mesh = this.mesh(parent, this.geometry('s' + radius, () => new THREE.SphereGeometry(radius, 32, 24)), position, material);
    if (scale) mesh.scale.set(...scale);
    return mesh;
  }

  cylinder(parent, radius, height, position, material) {
    return this.mesh(parent, this.geometry('c' + radius + height, () => new THREE.CylinderGeometry(radius, radius, height, 64)), position, material);
  }

  torus(parent, radius, tube, position, material, rotation) {
    const mesh = this.mesh(parent, this.geometry('t' + radius + tube, () => new THREE.TorusGeometry(radius, tube, 10, 64)), position, material);
    if (rotation) mesh.rotation.set(...rotation);
    return mesh;
  }

  displaySurface(width, height, depth, bulge, material) {
    const vertices = [0, 0, depth + bulge], uvs = [.5, .5], indices = [];
    const segments = 96, rings = 18;
    for (let ring = 1; ring <= rings; ring++) for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2, r = ring / rings;
      const x = power(Math.cos(angle), .52) * r, y = power(Math.sin(angle), .52) * r;
      vertices.push(x * width / 2, y * height / 2, depth + bulge * (1 - r * r));
      uvs.push(x / 2 + .5, y / 2 + .5);
      const current = 1 + (ring - 1) * segments + i, next = 1 + (ring - 1) * segments + (i + 1) % segments;
      if (ring === 1) indices.push(0, current, next);
      else indices.push(current - segments, current, next, current - segments, next, next - segments);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = this.mesh(this.head, geometry, [0, -.01, 0], material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  housing() {
    // One closed surface runs from the rear shell through the bezel to the screen bed.
    // A separate open bezel left visible gaps where its contour missed the old shell.
    const profiles = [[0, 0, -.675], [.9, .68, -.667], [1.5, 1.12, -.61], [1.83, 1.35, -.46], [1.945, 1.43, -.20], [1.96, 1.445, .16], [1.98, 1.46, .44], [1.955, 1.43, .565], [1.88, 1.35, .642], [1.76, 1.235, .682], [1.705, 1.18, .66], [1.66, 1.135, .615], [0, 0, .59]];
    const curve = new THREE.CatmullRomCurve3(profiles.map(p => new THREE.Vector3(...p)));
    const rings = curve.getPoints(80).slice(1, -1), segments = 96;
    const vertices = [0, -.01, -.675], indices = [];
    rings.forEach((profile, ring) => {
      for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2;
        vertices.push(power(Math.cos(angle), .52) * profile.x / 2, power(Math.sin(angle), .52) * profile.y / 2 - .01, profile.z);
        const a = 1 + ring * segments + i, next = 1 + ring * segments + (i + 1) % segments;
        if (!ring) indices.push(0, next, a);
        else indices.push(a - segments, next - segments, a, a, next - segments, next);
      }
    });
    const end = vertices.length / 3, start = 1 + (rings.length - 1) * segments;
    vertices.push(0, -.01, .59);
    for (let i = 0; i < segments; i++) indices.push(start + i, start + (i + 1) % segments, end);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = this.materials.shell.clone();
    material.roughnessMap = null;
    this.shell = this.mesh(this.head, geometry, [0, 0, 0], material);
    this.shell.name = 'closed-head-shell';
  }

  ear(side) {
    const shape = new THREE.Shape();
    shape.moveTo(-.29, -.05);
    shape.bezierCurveTo(-.23, .14, .13, .57, .23, .61);
    shape.bezierCurveTo(.34, .65, .30, .04, .27, -.09);
    shape.quadraticCurveTo(.07, -.18, -.29, -.05);
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: .19, bevelEnabled: true, bevelSegments: 8, steps: 1, bevelSize: .06, bevelThickness: .055, curveSegments: 24 });
    extruded.deleteAttribute('normal');
    const geometry = mergeVertices(extruded);
    geometry.computeVertexNormals();
    const pivot = new THREE.Group();
    pivot.position.set(side * .65, .61, -.015);
    pivot.scale.set(side * .94, .9, 1);
    this.head.add(pivot);
    this.mesh(pivot, geometry, [0, 0, -.14], 'blue');
    const gasket = this.mesh(pivot, geometry, [.015, .027, .07], 'joint');
    gasket.scale.set(.71, .73, .25);
    const insert = this.mesh(pivot, geometry, [.017, .038, .093], 'shell');
    insert.scale.set(.64, .66, .24);
    this.ears.push(pivot);
  }

  drawFace(mood, blink) {
    const key = mood + blink;
    if (key === this.lastFace) return;
    this.lastFace = key;
    const ctx = this.faceCanvas.getContext('2d');
    ctx.clearRect(0, 0, 768, 512);
    const reference = this.faceImages[blink ? 'sleep' : mood === 'chase' ? 'idle' : mood];
    if (reference?.complete && reference.naturalWidth) {
      ctx.drawImage(reference, 0, 0, 768, 512);
      this.faceTexture.needsUpdate = true;
      return;
    }
    const patterns = {
      idle: ['000111000', '001111100', '011000110', '110000011', '110000011', '110000011', '110000011', '110000011', '110000011'],
      happy: ['000000000', '000111000', '001111100', '011000110', '110000011', '110000011', '000000000', '000000000', '000000000'],
      sleep: ['000000000', '000000000', '000000000', '000000000', '110000011', '011111110', '000111000', '000000000', '000000000'],
      chase: ['001111100', '011111110', '111000111', '110000011', '110000011', '110000011', '111000111', '011111110', '001111100']
    };
    const draw = (pattern, left, top, size = 12) => {
      ctx.fillStyle = '#87eaff';
      ctx.shadowColor = '#1bcaff';
      ctx.shadowBlur = 13;
      pattern.forEach((row, y) => [...row].forEach((v, x) => {
        if (v === '1') ctx.fillRect(left + x * size, top + y * size, size - 1.8, size - 1.8);
      }));
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#c5f8ff';
      pattern.forEach((row, y) => [...row].forEach((v, x) => {
        if (v === '1') ctx.fillRect(left + x * size + 1, top + y * size + 1, size - 3.8, 2);
      }));
    };
    const eyes = patterns[blink ? 'sleep' : mood] || patterns.idle;
    draw(eyes, 145, 154, 14);
    draw(eyes, 497, 154, 14);
    draw(['01110', '11111', '01110'], 356, 301, 11);
    draw(['10000100001', '11000100011', '01101101110', '00111011100'], 323, 337, 11);
    draw(['01110', '11111', '11111', '01110'], 136, 322, 11);
    draw(['01110', '11111', '11111', '01110'], 579, 322, 11);
    this.faceTexture.needsUpdate = true;
  }

  segment(mesh, a, b) {
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(Y, new THREE.Vector3().subVectors(b, a).normalize());
  }

  animate(time, speed, action, elapsed, reduced, groundHeight = () => 0, turnSpeed = 0) {
    const sleeping = action === 'sleep';
    const happy = action === 'pet' || action === 'celebrate';
    const motion = reduced ? 0 : Math.hypot(speed, turnSpeed * .15);
    const gait = Math.min(motion, 1.6);
    this.walkBlend = THREE.MathUtils.damp(this.walkBlend || 0, THREE.MathUtils.smoothstep(motion, 0, .45), 8, elapsed);
    this.sleepBlend = THREE.MathUtils.damp(this.sleepBlend || 0, sleeping ? 1 : 0, 5, elapsed);
    this.happyBlend = THREE.MathUtils.damp(this.happyBlend || 0, happy && !reduced ? 1 : 0, 5, elapsed);
    this.pickupBlend = THREE.MathUtils.damp(this.pickupBlend || 0, action === 'retrieve' ? 1 : 0, 6, elapsed);
    this.turnLean = THREE.MathUtils.damp(this.turnLean || 0, reduced ? 0 : clamp(turnSpeed * speed * -.025, -.07, .07), 5, elapsed);
    // Let the last step settle as speed drops, instead of freezing a raised paw.
    this.phase += Math.max(motion, this.walkBlend * .24) * elapsed * Math.PI / .36;
    const bob = gait * .018 * Math.cos(this.phase * 2);
    const breathe = reduced ? 0 : Math.sin(time * 2) * .009;
    this.body.position.y = .76 + this.walkBlend * .12 + bob + breathe - this.sleepBlend * .13;
    this.body.rotation.z = gait * .018 * Math.sin(this.phase) + this.turnLean;
    this.pendant.rotation.z = reduced ? 0 : Math.sin(time * 2.6) * .055 + gait * Math.sin(this.phase) * .08;
    this.head.position.y = 2.02 + this.walkBlend * .12 + bob + breathe - this.sleepBlend * .23 - this.pickupBlend * .15;
    this.head.position.z = .45;
    this.head.rotation.x = this.sleepBlend * .19 + this.pickupBlend * .13 + this.happyBlend * Math.sin(time * 7) * .04 - .025;
    this.head.rotation.z = this.happyBlend * Math.sin(time * 4) * .075 + (reduced ? 0 : Math.sin(time * .7) * .023);
    this.head.rotation.y = reduced ? 0 : Math.sin(time * .55) * .10 * (1 - this.walkBlend);
    this.ears.forEach((ear, i) => { ear.rotation.z = reduced ? 0 : this.happyBlend * Math.sin(time * 7 + i) * .045; });
    this.root.updateWorldMatrix(true, false);
    for (const leg of this.legs) {
      const cycle = ((this.phase + leg.phase) / (Math.PI * 2)) % 1;
      const swing = cycle < .5, progress = swing ? cycle * 2 : (cycle - .5) * 2;
      const smooth = progress * progress * (3 - 2 * progress);
      const lift = swing ? Math.sin(progress * Math.PI) ** 2 * .17 * this.walkBlend : 0;
      const stride = (swing ? -.18 + .36 * smooth : .18 - .36 * smooth) * this.walkBlend;
      const wave = leg.front === 1 && leg.side === -1 ? this.happyBlend * (1 - this.walkBlend) : 0;
      const hipHeight = leg.front === 1 ? 1.02 : .65;
      const hip = new THREE.Vector3(leg.x, hipHeight + this.walkBlend * (leg.front === 1 ? .04 : .12) + bob - this.sleepBlend * .1, leg.z);
      const foot = new THREE.Vector3(leg.x - wave * .10, .135 + lift + wave * (.30 + Math.sin(time * 8) * .035), leg.z + stride + (leg.front === 1 ? .41 : .09) + wave * .14);
      // A planted foot remains in world space through stance, including gradual turns.
      // Swing and stopping release the anchor so interrupted steps settle smoothly.
      if (!swing && this.walkBlend > .85 && !reduced && !wave) {
        if (!leg.planted) leg.planted = this.root.localToWorld(foot.clone());
        const planted = this.root.worldToLocal(leg.planted.clone());
        foot.x = clamp(planted.x, leg.x - .18, leg.x + .18);
        foot.z = clamp(planted.z, leg.z - .20, leg.z + (leg.front === 1 ? .64 : .32));
      } else leg.planted = null;
      foot.y += groundHeight(foot.x, foot.z);
      const delta = foot.clone().sub(hip);
      const lengthA = leg.front === 1 ? .59 : .40, lengthB = leg.front === 1 ? .56 : .39;
      const distance = clamp(delta.length(), .08, lengthA + lengthB - .001), direction = delta.normalize();
      const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
      const height = Math.sqrt(Math.max(0, lengthA * lengthA - along * along));
      const bend = new THREE.Vector3(0, direction.z, -direction.y).normalize().multiplyScalar(leg.front === 1 ? -1 : 1);
      const knee = hip.clone().addScaledVector(direction, along).addScaledVector(bend, height);
      leg.hip.position.copy(hip);
      leg.knee.position.copy(knee);
      leg.foot.position.copy(foot);
      leg.foot.rotation.x = -wave * .7;
      this.segment(leg.upper, hip, knee);
      this.segment(leg.lower, knee, foot);
    }
    this.tailPhase += reduced ? 0 : elapsed * (2 + this.happyBlend * 4);
    this.tail.forEach((pivot, i) => {
      pivot.rotation.x = .10 + i * .073;
      pivot.rotation.y = (i === 0 ? -.46 : -.055) + (reduced ? 0 : Math.sin(this.tailPhase - i * .40) * (.065 + this.happyBlend * .105));
    });
    this.drawFace(sleeping ? 'sleep' : happy ? 'happy' : action === 'chase' ? 'chase' : 'idle', !happy && time % 4.8 > 4.64);
  }
}
