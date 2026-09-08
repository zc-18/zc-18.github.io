import * as THREE from '../lib/pet/three.module.js';
import * as CANNON from '../lib/pet/cannon-es.js';
import { OrbitControls } from '../lib/pet/OrbitControls.js';
import { RoomEnvironment } from '../lib/pet/RoomEnvironment.js';
import { EffectComposer } from '../lib/pet/EffectComposer.js';
import { RenderPass } from '../lib/pet/RenderPass.js';
import { SSAOPass } from '../lib/pet/SSAOPass.js';
import { OutputPass } from '../lib/pet/OutputPass.js';
import { RobotCat } from './model.js';
import { createStudio } from './studio.js';
import { icons } from '../lib/pet/icons.js';

const clamp = THREE.MathUtils.clamp;
const stateNames = { idle: '待命中', wander: '正在巡视', chase: '正在追球', return: '把球带回来', pet: '好喜欢你', celebrate: '接球成功', dock: '返回充电座', charging: '正在充电', sleep: '休息中' };
const icon = name => {
  const { width, height, path } = icons[name];
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
};
const button = (action, label, symbol, pressed) => `<button class="cl-pet-icon" type="button" data-action="${action}" aria-label="${label}" data-tip="${label}"${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${icon(symbol)}</button>`;

export class PetExperience {
  constructor() {
    this.reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = this.reducedQuery.matches;
    this.mobile = matchMedia('(max-width: 600px)').matches;
    this.room = false;
    this.visible = false;
    this.running = false;
    this.paused = true;
    this.time = 0;
    this.state = 'idle';
    this.stateUntil = 0;
    this.target = new THREE.Vector3();
    this.moveVelocity = new THREE.Vector3();
    this.turnSpeed = 0;
    this.dock = new THREE.Vector3(-3, 0, -2.8);
    this.returnPoint = new THREE.Vector3();
    this.stats = { energy: 86, affection: 12, catches: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem('cl-pet-v1'));
      if (saved) for (const key of Object.keys(this.stats)) {
        if (Number.isFinite(saved[key])) this.stats[key] = clamp(saved[key], 0, key === 'catches' ? 99999 : 100);
      }
    } catch (_) { /* Storage can be disabled in private browsing. */ }
    this.host = document.createElement('section');
    this.host.id = 'cl-pet';
    this.host.hidden = true;
    this.host.setAttribute('aria-label', '机器猫');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('aria-label', '抚摸机器猫并打开互动空间');
    this.host.append(canvas);
    this.hud = document.createElement('div');
    this.hud.className = 'cl-pet-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = `<div class="cl-pet-heading"><p>SHIQI / LITTLE STUDIO</p><h2>十七的伙伴</h2><div class="cl-pet-state">在你身边</div></div>
      <div class="cl-pet-toptools">${button('light', '切换昼夜', 'moon', false)}${button('orbit', '环绕观察', 'rotate', false)}${button('camera', '镜头复位', 'crosshairs')}${button('close', '回到博客', 'xmark')}</div>
      <div class="cl-pet-bottom"><div class="cl-pet-toast" role="status" aria-live="polite"></div>
      <div class="cl-pet-meters"><label class="cl-pet-meter">电量 <meter data-meter="energy" min="0" max="100" value="86"></meter></label><label class="cl-pet-meter">亲密 <meter data-meter="affection" min="0" max="100" value="12"></meter></label><span class="cl-pet-score">接球 0</span></div>
      <div class="cl-pet-actions">${button('pet', '抚摸', 'hand')}${button('ball', '抛球', 'baseball')}${button('charge', '充电', 'bolt')}${button('sleep', '休息', 'bed', false)}${button('pause', '暂停自主移动', 'pause', this.paused)}</div></div>`;
    this.host.append(this.hud);
    document.body.append(this.host);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(37, 1, .1, 120);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .075;
    this.controls.enablePan = false;
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 14;
    this.controls.minPolarAngle = .45;
    this.controls.maxPolarAngle = Math.PI / 2 - .05;
    this.controls.autoRotateSpeed = .65;
    this.controls.enabled = false;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.environment = pmrem.fromScene(environment, .04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .65;
    environment.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xe2f6ff, 0x97a39b, 1.6));
    this.key = new THREE.DirectionalLight(0xfff3e1, 4.1);
    this.key.position.set(-4, 8, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    Object.assign(this.key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .1, far: 30 });
    this.key.shadow.bias = -.00025;
    this.key.shadow.normalBias = .025;
    this.key.shadow.radius = 3;
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0x80d8ff, 2.0);
    this.rim.position.set(4, 4, -5);
    this.scene.add(this.rim);
    this.cat = new RobotCat();
    this.scene.add(this.cat.root);
    this.stage = new THREE.Group();
    this.stage.visible = false;
    this.scene.add(this.stage);
    this.createStage();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .17 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -.009;
    this.shadow.receiveShadow = true;
    this.scene.add(this.shadow);
    this.createPhysics();
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.mobile ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ambientOcclusion = new SSAOPass(this.scene, this.camera, 1, 1, this.mobile ? 16 : 24);
    this.ambientOcclusion.kernelRadius = .5;
    this.ambientOcclusion.minDistance = .00015;
    this.ambientOcclusion.maxDistance = .006;
    this.composer.addPass(this.ambientOcclusion);
    this.composer.addPass(new OutputPass());
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.night = false;
    this.setLight(this.night);
    this.bind();
    this.resetCamera();
    this.updateHUD();
  }

  createStage() {
    this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe3e8e4, roughness: .77, metalness: .04 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.025;
    floor.receiveShadow = true;
    this.stage.add(floor);
    this.studio = createStudio(this.stage);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.13, .045, 64), new THREE.MeshPhysicalMaterial({ color: 0xf0f4f3, metalness: .18, roughness: .32, clearcoat: .6 }));
    base.position.copy(this.dock).setY(.01);
    base.receiveShadow = true;
    this.stage.add(base);
    this.dockRing = new THREE.Mesh(new THREE.TorusGeometry(.9, .018, 10, 80), new THREE.MeshStandardMaterial({ color: 0x6de7c5, emissive: 0x27caa2, emissiveIntensity: 1.2 }));
    this.dockRing.rotation.x = Math.PI / 2;
    this.dockRing.position.copy(this.dock).setY(.045);
    this.stage.add(this.dockRing);
    for (const x of [-.2, .2]) {
      const contact = new THREE.Mesh(new THREE.BoxGeometry(.09, .025, .45), new THREE.MeshStandardMaterial({ color: 0xdeb778, metalness: .8, roughness: .25 }));
      contact.position.copy(this.dock).add(new THREE.Vector3(x, .045, 0));
      this.stage.add(contact);
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(.23, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0xf5a267, roughness: .5, metalness: .12, clearcoat: .5 }));
    this.ball.castShadow = true;
    this.ball.receiveShadow = true;
    this.ball.visible = false;
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(.229, .017, 8, 48), new THREE.MeshStandardMaterial({ color: 0xfff6e5, roughness: .5 }));
    this.ball.add(stripe);
    this.stage.add(this.ball);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(.16, .2, 40), new THREE.MeshBasicMaterial({ color: 0x39a8b9, transparent: true, opacity: .75, side: THREE.DoubleSide }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.stage.add(this.marker);
  }

  createPhysics() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
    const rubber = new CANNON.Material('rubber');
    const ground = new CANNON.Material('ground');
    this.world.addContactMaterial(new CANNON.ContactMaterial(rubber, ground, { friction: .45, restitution: .55 }));
    const plane = new CANNON.Body({ mass: 0, material: ground, shape: new CANNON.Plane() });
    plane.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(plane);
    // Polygonal perimeter confines the real rigid body to the visible circular play area.
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      const wall = new CANNON.Body({ mass: 0, material: ground, shape: new CANNON.Box(new CANNON.Vec3(.7, 2, .1)) });
      wall.position.set(Math.sin(angle) * 6.72, 2, Math.cos(angle) * 6.72);
      wall.quaternion.setFromEuler(0, angle, 0);
      this.world.addBody(wall);
    }
    this.ballBody = new CANNON.Body({ mass: .28, material: rubber, shape: new CANNON.Sphere(.23), linearDamping: .48, angularDamping: .45 });
    this.ballBody.position.set(0, -10, 0);
    this.world.addBody(this.ballBody);
    this.robotBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: ground, shape: new CANNON.Box(new CANNON.Vec3(.55, .48, .94)) });
    this.robotBody.position.set(0, .55, 0);
    this.world.addBody(this.robotBody);
  }

  bind() {
    const canvas = this.renderer.domElement;
    this.host.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) this.command(action);
    });
    const pointers = new Set();
    let down;
    canvas.addEventListener('pointerdown', e => {
      pointers.add(e.pointerId);
      if (pointers.size > 1) { down = null; return; }
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    canvas.addEventListener('pointermove', e => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) down.moved = true;
    });
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); down = null; });
    canvas.addEventListener('lostpointercapture', e => { pointers.delete(e.pointerId); });
    canvas.addEventListener('pointerup', e => {
      pointers.delete(e.pointerId);
      if (!down || down.id !== e.pointerId || down.moved) { down = null; return; }
      down = null;
      if (!this.room) { this.open(); this.command('pet'); return; }
      const rect = canvas.getBoundingClientRect();
      this.pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (this.raycaster.intersectObject(this.cat.root, true).length) this.command('pet');
      else {
        const point = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point) && point.length() < 5.3 && !['chase', 'return', 'dock', 'charging', 'sleep'].includes(this.state)) {
          this.target.copy(point);
          this.manualMove = true;
          this.setState('wander');
          this.marker.position.copy(point).setY(.015);
          this.marker.visible = true;
        }
      }
    });
    this.host.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.room) { e.preventDefault(); this.close(); }
      if (e.key === 'Tab' && this.room) {
        const focusable = [canvas, ...this.host.querySelectorAll('button:not(:disabled)')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.target !== canvas) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!this.room) this.open(); this.command('pet'); }
      if (this.room && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-'].includes(e.key)) {
        e.preventDefault();
        const offset = this.camera.position.clone().sub(this.controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += e.key === 'ArrowLeft' ? .15 : e.key === 'ArrowRight' ? -.15 : 0;
        spherical.phi = clamp(spherical.phi + (e.key === 'ArrowUp' ? -.1 : e.key === 'ArrowDown' ? .1 : 0), this.controls.minPolarAngle, this.controls.maxPolarAngle);
        spherical.radius = clamp(spherical.radius + (e.key === '+' ? -.4 : e.key === '-' ? .4 : 0), this.controls.minDistance, this.controls.maxDistance);
        this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        this.controls.update();
      }
    });
    window.addEventListener('resize', () => { this.resize(); this.updateVisibility(); });
    document.addEventListener('visibilitychange', () => { this.updateVisibility(); if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());
    this.reducedQuery.addEventListener('change', e => {
      this.reduced = e.matches;
      if (this.reduced) { this.paused = true; this.controls.autoRotate = false; }
      this.updateHUD();
    });
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.contextLost = true;
      this.close();
      this.updateVisibility();
      this.toast('3D 显示已暂停');
    });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.updateVisibility(); });
  }

  suspend() {
    if (this.room) this.close();
    this.updateVisibility();
  }

  updateVisibility() {
    this.visible = !document.hidden && !this.contextLost && this.room;
    this.host.hidden = !this.visible;
    if (this.visible) {
      this.resize();
      if (!this.running) { this.running = true; this.lastFrame = performance.now(); this.frame = requestAnimationFrame(t => this.tick(t)); }
    } else {
      cancelAnimationFrame(this.frame);
      this.running = false;
    }
  }

  open() {
    if (this.room || this.contextLost) return;
    this.previousFocus = document.activeElement;
    this.room = true;
    document.querySelectorAll('.cl-pet-launch').forEach(button => button.setAttribute('aria-expanded', 'true'));
    this.host.classList.add('cl-pet-room');
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.renderer.domElement.setAttribute('aria-label', '机器猫互动场景');
    this.hud.hidden = false;
    this.stage.visible = true;
    this.shadow.visible = false;
    this.controls.enabled = true;
    this.cat.root.position.set(0, 0, 0);
    this.cat.root.rotation.set(0, 0, 0);
    this.moveVelocity.set(0, 0, 0);
    this.turnSpeed = 0;
    this.setState('idle', 3);
    this.cancelBall();
    this.scrollStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.inertNodes = [...document.body.children].filter(el => el !== this.host && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)).map(el => [el, el.inert]);
    this.inertNodes.forEach(([el]) => { el.inert = true; });
    this.setLight(this.night);
    this.resize();
    this.resetCamera();
    this.updateVisibility();
    this.host.querySelector('[data-action="close"]').focus();
  }

  close() {
    if (!this.room) return;
    this.room = false;
    document.querySelectorAll('.cl-pet-launch').forEach(button => button.setAttribute('aria-expanded', 'false'));
    this.host.classList.remove('cl-pet-room', 'cl-pet-night');
    this.host.removeAttribute('role');
    this.host.removeAttribute('aria-modal');
    this.renderer.domElement.setAttribute('aria-label', '抚摸机器猫并打开互动空间');
    this.hud.hidden = true;
    this.stage.visible = false;
    this.shadow.visible = true;
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.cat.root.position.set(0, 0, 0);
    this.cat.root.rotation.set(0, 0, 0);
    this.setState('idle', 2);
    this.cancelBall();
    this.marker.visible = false;
    this.scene.background = null;
    this.scene.fog = null;
    document.body.style.overflow = this.scrollStyle;
    this.inertNodes?.forEach(([el, inert]) => { if (el.isConnected) el.inert = inert; });
    this.inertNodes = null;
    this.setLight(this.night);
    this.resize();
    this.resetCamera();
    this.save();
    this.updateVisibility();
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.updateHUD();
  }

  resize() {
    this.mobile = innerWidth <= 600;
    const width = innerWidth;
    const height = innerHeight;
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.host.style.setProperty('--pet-height', innerHeight + 'px');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.5));
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Contact shading can run at lower resolution while the model stays sharp.
    const occlusionRatio = this.renderer.getPixelRatio() * .65;
    this.ambientOcclusion.setSize(Math.round(width * occlusionRatio), Math.round(height * occlusionRatio));
    if (this.room) this.resetCamera();
  }

  resetCamera() {
    this.controls.target.copy(this.cat.root.position).add(new THREE.Vector3(0, 1.57, 0));
    const ratio = Math.max(1, .81 / this.camera.aspect);
    const offset = new THREE.Vector3(4.2, 1.95, 7.0).multiplyScalar(ratio);
    this.controls.maxDistance = Math.max(14, offset.length() * 1.15);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  setLight(night) {
    this.night = night;
    this.host.classList.toggle('cl-pet-night', night && this.room);
    this.key.color.setHex(night && this.room ? 0xc3e3ff : 0xfff3e1);
    this.key.intensity = night && this.room ? 2.1 : 2.6;
    this.rim.color.setHex(night && this.room ? 0xffbd82 : 0x80d8ff);
    this.rim.intensity = night && this.room ? 2.6 : 1.9;
    this.scene.environmentIntensity = night && this.room ? .5 : .85;
    this.scene.children.find(child => child.isHemisphereLight).intensity = night && this.room ? .75 : 1.0;
    this.renderer.toneMappingExposure = night && this.room ? 1.0 : 1.02;
    this.studio.setNight(night);
    if (this.room) {
      const color = night ? 0x344e4a : 0xdde6de;
      this.scene.background = new THREE.Color(color);
      this.scene.fog = new THREE.Fog(color, 17, 52);
      this.floorMaterial.color.setHex(night ? 0x647c71 : 0xe3e8e4);
    }
    this.host.querySelector('[data-action="light"]').setAttribute('aria-pressed', String(night));
    this.host.querySelector('[data-action="light"]').innerHTML = icon(night ? 'sun' : 'moon');
  }

  setState(state, duration = 0) {
    this.state = state;
    this.stateUntil = this.time + duration;
    this.host.dataset.state = state;
    this.updateHUD();
  }

  toast(text) {
    this.host.querySelector('.cl-pet-toast').textContent = text;
    this.toastUntil = this.time + 3.5;
  }

  command(action) {
    if (action === 'close') { this.close(); return; }
    if (action === 'light') { this.setLight(!this.night); return; }
    if (action === 'camera') { this.resetCamera(); return; }
    if (action === 'orbit') {
      this.controls.autoRotate = !this.controls.autoRotate;
      this.updateHUD();
      return;
    }
    if (action === 'pause') {
      this.paused = !this.paused;
      this.manualMove = false;
      this.updateHUD();
      return;
    }
    if (action === 'pet') {
      if (this.lastPet !== undefined && this.time < this.lastPet + .6) return;
      this.lastPet = this.time;
      this.stats.affection = Math.min(100, this.stats.affection + 3);
      if (['chase', 'return', 'dock', 'charging'].includes(this.state)) {
        this.petUntil = this.time + 1.5;
      } else this.setState('pet', 2.5);
      this.toast(this.stats.affection >= 100 ? '最喜欢和你待在一起' : '亲密 +3');
    }
    if (action === 'ball') {
      if (this.stats.energy < 8) { this.toast('电量不足，先充会儿电吧'); return; }
      if (['chase', 'return'].includes(this.state)) return;
      this.throwBall();
    }
    if (action === 'charge') {
      this.cancelBall();
      this.target.copy(this.dock);
      this.marker.visible = false;
      this.setState('dock');
    }
    if (action === 'sleep') {
      this.cancelBall();
      this.setState(this.state === 'sleep' ? 'idle' : 'sleep', 2);
      this.marker.visible = false;
    }
    this.updateHUD();
    this.save();
  }

  throwBall() {
    this.returnPoint.copy(this.cat.root.position);
    const angle = Math.random() * Math.PI * 2;
    const destination = new THREE.Vector3(Math.sin(angle) * 3.8, 0, Math.cos(angle) * 3.8);
    const source = this.cat.root.position.clone().add(new THREE.Vector3(Math.sin(angle) * 1.5, 2.5, Math.cos(angle) * 1.5));
    this.ballBody.position.copy(source);
    this.ballBody.velocity.set((destination.x - source.x) * 1.4, 2.1, (destination.z - source.z) * 1.4);
    this.ballBody.angularVelocity.set(3, 1, 2);
    this.ballBody.collisionResponse = true;
    this.ballBody.wakeUp();
    this.ball.position.copy(source);
    this.ball.visible = true;
    this.carrying = false;
    this.setState('chase');
    this.toast('去把球捡回来');
    this.marker.visible = false;
  }

  cancelBall() {
    this.ball.visible = false;
    this.carrying = false;
    this.ballBody.position.set(0, -10, 0);
    this.ballBody.velocity.setZero();
    this.ballBody.sleep();
  }

  updateHUD() {
    if (!this.hud) return;
    this.host.querySelector('.cl-pet-state').textContent = this.paused && ['idle', 'wander'].includes(this.state) ? '在你身边' : stateNames[this.state];
    for (const key of ['energy', 'affection']) {
      const meter = this.host.querySelector(`[data-meter="${key}"]`);
      meter.value = this.stats[key];
      meter.title = Math.round(this.stats[key]) + '%';
    }
    this.host.querySelector('.cl-pet-score').textContent = '接球 ' + this.stats.catches;
    for (const [action, pressed] of [['pause', this.paused], ['sleep', this.state === 'sleep'], ['orbit', this.controls?.autoRotate || false]]) {
      this.host.querySelector(`[data-action="${action}"]`).setAttribute('aria-pressed', String(pressed));
    }
    const pause = this.host.querySelector('[data-action="pause"]');
    pause.dataset.tip = this.paused ? '恢复自主移动' : '暂停自主移动';
    pause.setAttribute('aria-label', pause.dataset.tip);
    pause.innerHTML = icon(this.paused ? 'play' : 'pause');
    this.host.querySelector('[data-action="ball"]').disabled = ['chase', 'return'].includes(this.state);
  }

  save() {
    try { localStorage.setItem('cl-pet-v1', JSON.stringify(this.stats)); } catch (_) { /* Optional persistence. */ }
  }

  moveTo(target, dt, maxSpeed) {
    const position = this.cat.root.position;
    const delta = target ? target.clone().sub(position).setY(0) : new THREE.Vector3();
    const distance = delta.length();
    let desiredTurn = 0;
    if (distance > .035) {
      const desired = Math.atan2(delta.x, delta.z);
      const difference = Math.atan2(Math.sin(desired - this.cat.root.rotation.y), Math.cos(desired - this.cat.root.rotation.y));
      desiredTurn = clamp(difference * 5, -2.8, 2.8);
      const speed = Math.min(maxSpeed, (distance - .035) * 2.3) * Math.max(0, Math.cos(difference)) ** 2;
      delta.multiplyScalar(speed / distance);
    } else delta.set(0, 0, 0);
    // Ease both steering and travel. Braking uses the same path when an action interrupts a walk.
    const turnBlend = 1 - Math.exp(-dt * 10);
    this.cat.root.rotation.y += desiredTurn * dt + (this.turnSpeed - desiredTurn) * turnBlend / 10;
    this.turnSpeed += (desiredTurn - this.turnSpeed) * turnBlend;
    const damping = delta.lengthSq() > this.moveVelocity.lengthSq() ? 5 : 8;
    const blend = 1 - Math.exp(-dt * damping);
    const step = this.moveVelocity.clone().multiplyScalar(blend / damping).addScaledVector(delta, dt - blend / damping);
    position.add(step);
    this.moveVelocity.lerp(delta, blend);
    const radius = Math.hypot(position.x, position.z);
    if (radius > 5.35) position.multiplyScalar(5.35 / radius);
    return dt > 0 ? step.length() / dt : 0;
  }

  updateRoom(dt) {
    let speed;
    const position = this.cat.root.position;
    this.robotBody.position.set(position.x, .55, position.z);
    this.robotBody.quaternion.setFromEuler(0, this.cat.root.rotation.y, 0);
    this.world.step(1 / 60, dt, 6);
    if (this.ball.visible && !this.carrying) {
      this.ball.position.copy(this.ballBody.position);
      this.ball.quaternion.copy(this.ballBody.quaternion);
    }
    if (this.state === 'chase') {
      this.target.copy(this.ball.position).setY(0);
      const length = this.target.length();
      if (length > 5.3) this.target.multiplyScalar(5.3 / length);
      speed = this.moveTo(this.target, dt, 1.9);
      const ballDistance = Math.hypot(position.x - this.ball.position.x, position.z - this.ball.position.z);
      if (ballDistance < 1.35 && this.ball.position.y < .7) {
        this.carrying = true;
        this.ballBody.collisionResponse = false;
        this.ballBody.sleep();
        this.target.copy(this.returnPoint);
        this.setState('return');
      }
    } else if (this.state === 'return') {
      speed = this.moveTo(this.target, dt, 1.3);
      if (position.distanceTo(this.target) < .15) {
        this.cancelBall();
        this.stats.catches++;
        this.stats.affection = Math.min(100, this.stats.affection + 5);
        this.stats.energy = Math.max(0, this.stats.energy - 3);
        this.setState('celebrate', 2.8);
        this.toast('接球成功 · 亲密 +5');
        this.save();
      }
    } else if (this.state === 'dock') {
      speed = this.moveTo(this.dock, dt, 1.1);
      if (position.distanceTo(this.dock) < .1) this.setState('charging');
    } else if (this.state === 'charging') {
      this.stats.energy = Math.min(100, this.stats.energy + dt * 7);
      if (this.stats.energy >= 100) { this.setState('celebrate', 3); this.toast('电量已充满'); this.save(); }
    } else if (this.state === 'sleep') {
      this.stats.energy = Math.min(100, this.stats.energy + dt * .5);
    } else if (this.state === 'wander') {
      if (!this.paused || this.manualMove) speed = this.moveTo(this.target, dt, .75);
      if (position.distanceTo(this.target) < .12) { this.manualMove = false; this.setState('idle', 2 + Math.random() * 3); this.marker.visible = false; }
    } else if (this.time > this.stateUntil) {
      if (!this.paused) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.5 + Math.random() * 2.5;
        this.target.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
        this.setState('wander');
      } else if (this.state !== 'idle') this.setState('idle', 2);
    }
    if (speed === undefined) speed = this.moveTo(null, dt, 0);
    if (this.carrying) {
      this.ball.position.set(0, 1.42, 1.41).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cat.root.rotation.y).add(position);
    }
    if (!['sleep', 'charging', 'dock'].includes(this.state)) {
      this.stats.energy = Math.max(0, this.stats.energy - dt * (speed > .1 ? .12 : .025));
      if (this.stats.energy < 3 && !['chase', 'return'].includes(this.state)) { this.target.copy(this.dock); this.setState('dock'); }
    }
    this.cat.animate(this.time, speed, this.time < this.petUntil ? 'pet' : this.state, dt, this.reduced, (x, z) => {
      const cosine = Math.cos(this.cat.root.rotation.y), sine = Math.sin(this.cat.root.rotation.y);
      const worldX = position.x + x * cosine + z * sine;
      const worldZ = position.z - x * sine + z * cosine;
      const edge = Math.hypot(worldX - this.dock.x, worldZ - this.dock.z);
      return .034 * (1 - THREE.MathUtils.smoothstep(edge, 1.0, 1.14));
    }, this.turnSpeed);
    this.studio.contact.position.set(position.x, .004, position.z);
    const desiredTarget = position.clone().add(new THREE.Vector3(0, 1.57, 0));
    const follow = desiredTarget.sub(this.controls.target).multiplyScalar(1 - Math.exp(-dt * 4));
    this.controls.target.add(follow);
    this.camera.position.add(follow);
    this.controls.update(dt);
    this.studio.updateCamera(this.camera, this.controls.target);
    this.dockRing.material.emissiveIntensity = this.state === 'charging' ? 2 + Math.sin(this.time * 3) * .5 : 1.2;
    this.marker.material.opacity = .5 + Math.sin(this.time * 4) * .15;
    return speed;
  }

  tick(now) {
    if (!this.visible) { this.running = false; return; }
    this.frame = requestAnimationFrame(t => this.tick(t));
    const interval = this.room && !this.mobile ? 1000 / 60 : 1000 / 30;
    if (now - this.lastFrame < interval - 1) return;
    const dt = Math.min((now - this.lastFrame) / 1000, .1);
    this.lastFrame = now;
    this.time += dt;
    this.updateRoom(dt);
    if (this.room && this.time > (this.nextHUD || 0)) {
      this.nextHUD = this.time + .5;
      this.updateHUD();
      if (this.time > this.toastUntil) this.host.querySelector('.cl-pet-toast').textContent = '';
    }
    // The normal/depth pass reuses this frame's shadow map instead of drawing it again.
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render(dt);
  }
}
