import * as THREE from '../lib/pet/three.module.js';
import { RoundedBoxGeometry } from '../lib/pet/RoundedBoxGeometry.js';

const rounded = (width, height, radius) => {
  const shape = new THREE.Shape(), x = -width / 2, y = 0;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
};

export function createStudio(stage) {
  const occluders = [];
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f4f1, roughness: .56 });
  const mint = new THREE.MeshStandardMaterial({ color: 0xb5cfc4, roughness: .92 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc7d5d4, roughness: .4, metalness: .38 });
  const clay = new THREE.MeshStandardMaterial({ color: 0xd48073, roughness: .88 });
  const green = new THREE.MeshStandardMaterial({ color: 0x4e9470, roughness: .64, side: THREE.DoubleSide });
  const leafLight = new THREE.MeshStandardMaterial({ color: 0x8bb876, roughness: .67, side: THREE.DoubleSide });
  const add = (geometry, material, position, parent = stage) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (size, position, material, radius = .05, parent = stage) => add(new RoundedBoxGeometry(...size, 3, radius), material, position, parent);
  const cylinder = (top, bottom, height, position, material, parent = stage) => add(new THREE.CylinderGeometry(top, bottom, height, 64), material, position, parent);
  const tube = (points, radius, material, parent = stage) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 8, false), material, [0, 0, 0], parent);

  // The opening, sill, and mullions are geometry; the distant garden is the generated bitmap.
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-6.5, .45, -8);
  stage.add(windowGroup);
  occluders.push(windowGroup);
  const frameShape = rounded(8.2, 6.5, 1.6);
  const hole = rounded(7.65, 5.94, 1.34);
  const holePath = new THREE.Path(hole.getPoints(48).map(p => p.add(new THREE.Vector2(0, .28))));
  frameShape.holes.push(holePath);
  add(new THREE.ExtrudeGeometry(frameShape, { depth: .34, bevelEnabled: true, bevelSize: .045, bevelThickness: .04, bevelSegments: 3, steps: 1, curveSegments: 40 }), white, [0, 0, 0], windowGroup);
  const garden = new THREE.TextureLoader().load('/img/pet-garden.webp');
  garden.colorSpace = THREE.SRGBColorSpace;
  const viewMaterial = new THREE.MeshBasicMaterial({ map: garden, color: 0xffffff });
  const viewGeometry = new THREE.ShapeGeometry(rounded(7.7, 6, 1.34), 48);
  const position = viewGeometry.attributes.position, uv = viewGeometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / 7.7 + .5, position.getY(i) / 6);
  const view = add(viewGeometry, viewMaterial, [0, .25, -.08], windowGroup);
  view.castShadow = view.receiveShadow = false;
  for (const x of [-1.28, 1.28]) box([.055, 5.85, .13], [x, 3.24, .14], white, .022, windowGroup);
  box([7.69, .055, .13], [0, 2.20, .14], white, .022, windowGroup);
  box([8.48, .17, .83], [0, .09, .15], white, .06, windowGroup);
  const wall = new THREE.Shape();
  wall.moveTo(-24, 0); wall.lineTo(24, 0); wall.lineTo(24, 12); wall.lineTo(-24, 12); wall.closePath();
  wall.holes.push(new THREE.Path(rounded(8.15, 6.45, 1.58).getPoints(48).map(p => p.add(new THREE.Vector2(-6.5, .45)))));
  occluders.push(add(new THREE.ExtrudeGeometry(wall, { depth: .15, bevelEnabled: false, curveSegments: 32 }), mint, [0, 0, -8.1]));
  occluders.push(box([48, .18, .12], [0, .095, -7.85], white));

  const rugMaterial = new THREE.MeshStandardMaterial({ color: 0xcadbd5, roughness: 1 });
  const rug = cylinder(6.52, 6.52, .014, [0, -.013, 0], rugMaterial);
  rug.castShadow = false;
  const rim = add(new THREE.RingGeometry(6.35, 6.41, 128), new THREE.MeshStandardMaterial({ color: 0xe4ebe4, roughness: 1, side: THREE.DoubleSide }), [0, -.002, 0]);
  rim.rotation.x = -Math.PI / 2;
  rim.castShadow = false;

  const plant = (x, z, scale, potMaterial) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    stage.add(group);
    occluders.push(group);
    cylinder(.43, .32, .64, [0, .32, 0], potMaterial, group);
    cylinder(.44, .44, .075, [0, .62, 0], potMaterial, group);
    cylinder(.38, .38, .02, [0, .65, 0], new THREE.MeshStandardMaterial({ color: 0x374a39, roughness: 1 }), group);
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4, height = 1.1 + (i % 4) * .25;
      const end = [Math.cos(angle) * .53, height, Math.sin(angle) * .53];
      tube([[0, .6, 0], [end[0] * .3, height * .75, end[2] * .3], end], .015, green, group);
      const geometry = new THREE.SphereGeometry(1, 20, 14);
      const positions = geometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        const py = positions.getY(j);
        positions.setXYZ(j, positions.getX(j) * .20 * (1 - py * .28), py * .43, positions.getZ(j) * .035 + py * py * .11);
      }
      geometry.computeVertexNormals();
      const leaf = add(geometry, i % 3 ? green : leafLight, end, group);
      leaf.rotation.set(.5, -angle, -.45);
    }
  };
  plant(3.2, -6.3, 1.8, clay);
  plant(-7.1, -4.2, 1.15, white);

  const shelf = new THREE.Group();
  shelf.position.set(.5, 0, -7.18);
  stage.add(shelf);
  occluders.push(shelf);
  box([3, .17, .87], [0, 1.38, 0], white, .07, shelf);
  for (const x of [-1.22, 1.22]) box([.12, 1.34, .60], [x, .68, 0], metal, .04, shelf);
  const bookColors = [0x728f9c, 0xd98979, 0xd7c993];
  for (let i = 0; i < 3; i++) box([.72 - i * .06, .11, .50], [-.7, 1.52 + i * .12, 0], new THREE.MeshStandardMaterial({ color: bookColors[i], roughness: .9 }), .018, shelf);
  cylinder(.19, .14, .43, [.60, 1.69, 0], clay, shelf);
  tube([[.60, 1.9, 0], [.55, 2.25, 0], [.72, 2.48, .03]], .018, green, shelf);
  const flower = add(new THREE.SphereGeometry(.14, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf1d28e, roughness: .7 }), [.72, 2.48, .03], shelf);
  flower.scale.set(1, .65, 1);

  const contactCanvas = document.createElement('canvas');
  contactCanvas.width = contactCanvas.height = 128;
  const ctx = contactCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(25,45,42,.23)');
  gradient.addColorStop(.55, 'rgba(25,45,42,.11)');
  gradient.addColorStop(1, 'rgba(25,45,42,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const contact = add(new THREE.PlaneGeometry(2.8, 2.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, depthWrite: false }), [0, .002, 0]);
  contact.rotation.x = -Math.PI / 2;
  contact.castShadow = contact.receiveShadow = false;
  stage.updateWorldMatrix(true, true);
  const bounds = occluders.map(object => ({ object, box: new THREE.Box3().setFromObject(object).expandByScalar(.65) }));
  const viewRay = new THREE.Ray(), intersection = new THREE.Vector3();
  return {
    contact,
    updateCamera(camera, target) {
      // Remove studio objects crossing the sight line, including when orbiting outside the window.
      viewRay.origin.copy(camera.position);
      viewRay.direction.copy(target).sub(camera.position).normalize();
      const distance = camera.position.distanceTo(target) - 1.5;
      for (const { object, box } of bounds) {
        const hit = viewRay.intersectBox(box, intersection);
        object.visible = !hit || hit.distanceTo(camera.position) > distance;
      }
    },
    setNight(night) {
      viewMaterial.color.setHex(night ? 0x526c91 : 0xffffff);
      mint.color.setHex(night ? 0x58766f : 0xb5cfc4);
      rugMaterial.color.setHex(night ? 0x75948a : 0xcadbd5);
    }
  };
}
