import * as THREE from '../lib/pet/three.module.js';

// The sky is an inset ceiling luminaire, with a real roof behind it. One texture,
// one animated surface and two shadowless fill lights serve the whole room.
export function createStarCeiling(stage, room, anisotropy) {
  const root = new THREE.Group();
  root.name = '星空灯天花板';
  stage.add(root);
  const width = room.maxX - room.minX - .62, depth = room.maxZ - room.minZ - .62;
  const centerZ = (room.minZ + room.maxZ) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = innerWidth <= 600 ? 1024 : 2048;
  const c = canvas.getContext('2d'), size = canvas.width;
  c.scale(size / 2048, size / 2048);
  c.fillStyle = '#161e39'; c.fillRect(0, 0, 2048, 2048);
  let seed = 1709;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const haze = (x, y, r, color, opacity) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${opacity})`); g.addColorStop(.45, `rgba(${color},${opacity * .45})`); g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (let i = 0; i < 90; i++) {
    const t = random(), x = t * 2400 - 180, y = 440 + t * 1080 + Math.sin(t * 8) * 180 + (random() - .5) * 330;
    haze(x, y, 150 + random() * 340, i % 3 ? '103,114,175' : '170,114,173', .055 + random() * .05);
  }
  haze(480, 1280, 780, '79,143,150', .24);
  haze(1440, 580, 760, '137,117,170', .22);
  const dot = (x, y, r, alpha = 1) => {
    c.fillStyle = `rgba(255,243,211,${alpha})`; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  };
  for (let i = 0; i < 820; i++) {
    const x = 22 + random() * 2004, y = 22 + random() * 2004, bright = random();
    if (bright > .9) haze(x, y, 8 + bright * 10, '191,211,255', .28);
    dot(x, y, bright > .94 ? 2.3 : .6 + random() * 1.2, .25 + bright * .7);
    if (bright > .985) {
      c.strokeStyle = 'rgba(255,238,200,.64)'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x + 8, y); c.moveTo(x, y - 8); c.lineTo(x, y + 8); c.stroke();
    }
  }
  // Three hand-arranged constellations give the eye quiet focal points.
  const constellations = [
    [[290, 465], [430, 423], [558, 489], [718, 474], [798, 636], [662, 700], [558, 489]],
    [[1250, 1330], [1390, 1190], [1525, 1360], [1660, 1190], [1810, 1310]],
    [[346, 1450], [435, 1320], [554, 1450], [472, 1605], [346, 1450]]
  ];
  c.strokeStyle = 'rgba(199,218,255,.23)'; c.lineWidth = 1.8;
  for (const points of constellations) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    for (const [x, y] of points) { haze(x, y, 18, '194,214,255', .4); dot(x, y, 3); }
  }
  // Warm crescent, painted without cutting a hole in the star field.
  c.save(); c.translate(-610, 1080);
  haze(1510, 430, 160, '246,206,142', .22);
  c.fillStyle = '#f8e1ad'; c.beginPath();
  c.moveTo(1541, 344); c.bezierCurveTo(1416, 362, 1416, 510, 1541, 519);
  c.bezierCurveTo(1494, 480, 1489, 396, 1541, 344); c.fill();
  c.restore();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = anisotropy;
  const uniforms = { sky: { value: map }, time: { value: 0 }, night: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, dithering: true,
    vertexShader: 'varying vec2 skyUV; void main() { skyUV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D sky;
      uniform float time;
      uniform float night;
      varying vec2 skyUV;
      #include <common>
      #include <dithering_pars_fragment>
      void main() {
        vec3 color = texture2D(sky, skyUV).rgb;
        float light = max(color.r, max(color.g, color.b));
        float phase = skyUV.x * 37.0 + skyUV.y * 43.0;
        float twinkle = .84 + .16 * sin(time * .65 + phase) * sin(time * .39 + phase * .71);
        float moonMask = smoothstep(.065, .09, distance(skyUV, vec2(.4395, .2627)));
        color *= mix(1.0, twinkle, smoothstep(.65, .95, light) * moonMask);
        // Leave the surrounding moulding visible; daylight is a cream diffuser.
        vec3 daylight = vec3(.86, .81, .71);
        gl_FragColor = vec4(mix(daylight, color * 1.18, night), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <dithering_fragment>
      }`
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  panel.name = '奶油漫射板与星空灯面';
  panel.position.set(0, room.height - .085, centerZ); panel.rotation.x = Math.PI / 2;
  root.add(panel);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xd6bd90, metalness: .28, roughness: .5 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe9bd, toneMapped: false });
  const strip = (size, position, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position); root.add(mesh);
  };
  for (const side of [-1, 1]) {
    strip([width + .11, .08, .055], [0, room.height - .12, centerZ + side * depth / 2], frameMaterial);
    strip([.055, .08, depth + .11], [side * width / 2, room.height - .12, centerZ], frameMaterial);
    strip([width, .025, .038], [0, room.height - .135, centerZ + side * (depth / 2 - .05)], glow);
    strip([.038, .025, depth], [side * (width / 2 - .05), room.height - .135, centerZ], glow);
  }
  const skyLight = new THREE.PointLight(0xa4b5f4, 0, 22, 2);
  skyLight.position.set(-3, 7.6, 1.8); root.add(skyLight);
  const roseLight = new THREE.PointLight(0xd5a7d5, 0, 18, 2);
  roseLight.position.set(6, 7.5, -3); root.add(roseLight);
  let isNight = false;
  return {
    setNight(amount) {
      isNight = amount > .01;
      uniforms.night.value = amount;
      skyLight.intensity = amount * 22;
      roseLight.intensity = amount * 9;
      glow.color.setHex(0xfff1d7).lerp(new THREE.Color(0xf7d8a0), amount);
    },
    update(time, reduced) { uniforms.time.value = isNight && !reduced ? time : 0; }
  };
}
