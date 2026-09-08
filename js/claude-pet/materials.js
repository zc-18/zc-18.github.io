import * as THREE from '../lib/pet/three.module.js';

const textureSets = new Map();

// Color maps are sRGB; normals/roughness stay linear. Each surface owns its UV scale.
export function roomMaterial(kind, color, repeat, anisotropy = 4, extra = {}) {
  const loader = new THREE.TextureLoader();
  const key = kind + '/' + repeat.join(',');
  if (!textureSets.has(key)) {
    const maps = {};
    for (const [channel, slot] of [['color', 'map'], ['normal', 'normalMap'], ['roughness', 'roughnessMap']]) {
      const texture = loader.load(`/img/pet-room/${kind}-${channel}.webp`, loaded => {
        // Preserve 2K color on desktop; small screens use a bounded GPU texture budget.
        const limit = innerWidth <= 600 ? (kind === 'oak' ? 1024 : 512) : channel === 'color' ? 2048 : 1024;
        if (loaded.image.width <= limit) return;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = limit;
        canvas.getContext('2d').drawImage(loaded.image, 0, 0, limit, limit);
        loaded.image = canvas; loaded.needsUpdate = true;
      });
      if (channel === 'color') texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = anisotropy;
      maps[slot] = texture;
    }
    textureSets.set(key, maps);
  }
  return new THREE.MeshStandardMaterial({ color, roughness: 1, ...textureSets.get(key), normalScale: new THREE.Vector2(.45, .45), ...extra });
}
