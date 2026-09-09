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
import { RoomNavigation, PET_RADIUS } from './navigation.js';
import { icons } from '../lib/pet/icons.js';

const clamp = THREE.MathUtils.clamp;
const stateNames = { idle: '待命中', wander: '在房间散步', chase: '正在追球', retrieve: '捡起小球', return: '把球带回来', pet: '好喜欢你', celebrate: '接球成功', dock: '返回充电座', charging: '正在充电', sleep: '休息中' };
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
    this.host.setAttribute('aria-label', '小狗的暖暖房间');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('aria-label', '抚摸伙伴并打开小狗房间');
    this.host.append(canvas);
    this.hud = document.createElement('div');
    this.hud.className = 'cl-pet-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = `<div class="cl-pet-heading"><p>SHIQI / PAWS & HOME</p><h2>旺星小窝</h2><div class="cl-pet-state">在你身边</div></div>
      <div class="cl-pet-toptools">${button('light', '切换昼夜', 'moon', false)}${button('orbit', '环绕观察', 'rotate', false)}${button('camera', '镜头复位', 'crosshairs')}${button('close', '回到博客', 'xmark')}</div>
      <div class="cl-pet-bottom"><div class="cl-pet-toast" role="status" aria-live="polite"></div>
      <div class="cl-pet-meters"><label class="cl-pet-meter">电量 <meter data-meter="energy" min="0" max="100" value="86"></meter></label><label class="cl-pet-meter">亲密 <meter data-meter="affection" min="0" max="100" value="12"></meter></label><span class="cl-pet-score">接球 0</span></div>
      <div class="cl-pet-actions">${button('pet', '抚摸', 'hand')}${button('ball', '抛球', 'baseball')}${button('charge', '充电', 'bolt')}${button('sleep', '休息', 'bed', false)}${button('pause', '暂停自主移动', 'pause', this.paused)}</div><p class="cl-pet-hint">拖动环顾小屋 · 滚轮靠近 · 轻点地面散步</p></div>`;
    this.host.append(this.hud);
    document.body.append(this.host);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, .08, 65);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .075;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.8;
    this.controls.maxDistance = 13;
    this.controls.minPolarAngle = .62;
    this.controls.maxPolarAngle = Math.PI / 2 - .04;
    this.controls.autoRotateSpeed = .4;
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
    this.key.position.set(-5, 7.3, -3.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    Object.assign(this.key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: .1, far: 45 });
    this.key.shadow.bias = -.00025;
    this.key.shadow.normalBias = .025;
    this.key.shadow.radius = 3;
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0x80d8ff, 2.0);
    this.rim.position.set(4, 5, 6);
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
    this.studio = createStudio(this.stage, this.renderer);
    this.navigation = new RoomNavigation(this.studio.boxes);
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
    // The same measured furniture bounds serve navigation and the physical ball.
    const solids = [...this.studio.physicalWalls, ...this.studio.boxes.map(({ box }) => ({ size: box.getSize(new THREE.Vector3()).toArray(), position: box.getCenter(new THREE.Vector3()).toArray() }))];
    for (const { size, position } of solids) {
      const body = new CANNON.Body({ mass: 0, material: ground, shape: new CANNON.Box(new CANNON.Vec3(...size.map(value => value / 2))) });
      body.position.set(...position);
      this.world.addBody(body);
    }
    this.ballBody = new CANNON.Body({ mass: .28, material: rubber, shape: new CANNON.Sphere(.23), linearDamping: .48, angularDamping: .45 });
    this.ballBody.position.set(0, -10, 0);
    this.world.addBody(this.ballBody);
    this.robotBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: ground });
    this.robotBody.addShape(new CANNON.Box(new CANNON.Vec3(.69, .57, .96)), new CANNON.Vec3(0, .82, -.27));
    this.robotBody.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 1.08, .85)), new CANNON.Vec3(0, 2.17, .45));
    for (const x of [-.53, .53]) for (const z of [-.68, .91]) this.robotBody.addShape(new CANNON.Box(new CANNON.Vec3(.26, .16, .33)), new CANNON.Vec3(x, .16, z));
    this.robotBody.position.set(0, 0, 0);
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
        const floorHit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point);
        const obstacleHit = this.raycaster.intersectObject(this.stage, true)[0];
        const visibleFloor = !obstacleHit || obstacleHit.distance + .05 >= this.camera.position.distanceTo(point);
        if (floorHit && visibleFloor && this.navigation.isFree(point) && !['chase', 'retrieve', 'return', 'dock', 'charging', 'sleep'].includes(this.state)) {
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
    this.renderer.domElement.setAttribute('aria-label', '小狗房间互动场景');
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
    this.renderer.domElement.setAttribute('aria-label', '抚摸伙伴并打开小狗房间');
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
    this.host.querySelector('.cl-pet-hint').textContent = this.mobile ? '单指环顾 · 双指缩放 · 轻点地面散步' : '拖动环顾小屋 · 滚轮靠近 · 轻点地面散步';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2));
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
    this.controls.target.copy(this.cat.root.position).add(new THREE.Vector3(0, 1.55, -.5));
    // The wide interior view always starts inside the four walls and below the ceiling.
    this.camera.fov = this.camera.aspect < .8 ? 64 : this.camera.aspect > 1.8 ? 54 : 58;
    this.camera.updateProjectionMatrix();
    const offset = this.mobile ? new THREE.Vector3(1.8, 3.6, 9.4) : new THREE.Vector3(3.8, 3.5, 10.0);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.studio.updateCamera(this.camera, this.controls.target);
  }

  setLight(night) {
    this.night = night;
    this.host.classList.toggle('cl-pet-night', night && this.room);
    this.key.color.setHex(night && this.room ? 0xb7c9eb : 0xffdfb3);
    this.key.intensity = night && this.room ? .8 : 2.8;
    this.rim.color.setHex(night && this.room ? 0xffbf87 : 0xffead0);
    this.rim.intensity = night && this.room ? 1.1 : 1.3;
    this.scene.environmentIntensity = night && this.room ? .28 : .65;
    this.scene.children.find(child => child.isHemisphereLight).intensity = night && this.room ? .36 : .9;
    this.renderer.toneMappingExposure = night && this.room ? 1.05 : 1.06;
    this.studio.setNight(night);
    if (this.room) {
      const color = night ? 0x34352f : 0xe8dcc8;
      this.scene.background = new THREE.Color(color);
      this.scene.fog = null;
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
      if (['chase', 'retrieve', 'return', 'dock', 'charging'].includes(this.state)) {
        this.petUntil = this.time + 1.5;
      } else this.setState('pet', 2.5);
      this.toast(this.stats.affection >= 100 ? '最喜欢和你待在一起' : '亲密 +3');
    }
    if (action === 'ball') {
      if (this.stats.energy < 8) { this.toast('电量不足，先充会儿电吧'); return; }
      if (['chase', 'retrieve', 'return'].includes(this.state)) return;
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
    const position = this.cat.root.position;
    // Launch outside the entire head/tail envelope, along a clear stretch of floor.
    const candidates = this.navigation.nodes.filter(node => node.point.distanceTo(position) > 4 && node.point.distanceTo(position) < 7.5 && this.navigation.clearLine(position, node.point));
    const destination = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].point : this.navigation.sample(4.5);
    const distance = position.distanceTo(destination);
    const source = position.clone().lerp(destination, Math.min(1, 2.7 / distance)).setY(2.6);
    this.ballBody.position.copy(source);
    this.ballBody.velocity.set((destination.x - source.x) * .9, 1.6, (destination.z - source.z) * .9);
    this.ballBody.angularVelocity.set(3, 1, 2);
    this.ballBody.collisionResponse = true;
    this.ballBody.wakeUp();
    this.ball.position.copy(source);
    this.ball.visible = true;
    this.carrying = false;
    this.fetchStarted = this.time;
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
    this.host.querySelector('[data-action="ball"]').disabled = ['chase', 'retrieve', 'return'].includes(this.state);
  }

  save() {
    try { localStorage.setItem('cl-pet-v1', JSON.stringify(this.stats)); } catch (_) { /* Optional persistence. */ }
  }

  moveTo(target, dt, maxSpeed, faceTarget = null) {
    const position = this.cat.root.position;
    if (target && (!this.pathTarget || this.pathTarget.distanceTo(target) > .45 || this.pathState !== this.state)) {
      this.path = this.navigation.path(position, target);
      this.pathTarget = target.clone();
      this.pathState = this.state;
    }
    if (target) while (this.path.length > 1 && position.distanceTo(this.path[0]) < .20) this.path.shift();
    const waypoint = target ? this.path[0] : null;
    const delta = waypoint ? waypoint.clone().sub(position).setY(0) : new THREE.Vector3();
    const distance = delta.length();
    let desiredTurn = 0;
    const faceOnly = faceTarget && distance < .18 && this.path.length === 1;
    if (distance > .035 || faceOnly) {
      const aim = faceOnly ? faceTarget.clone().sub(position) : delta;
      const desired = Math.atan2(aim.x, aim.z);
      const difference = Math.atan2(Math.sin(desired - this.cat.root.rotation.y), Math.cos(desired - this.cat.root.rotation.y));
      desiredTurn = clamp(difference * 5, -2.8, 2.8);
      const speed = faceOnly ? 0 : Math.min(maxSpeed, (distance - .035) * 2.3) * Math.max(0, Math.cos(difference)) ** 2;
      if (speed > 0) delta.multiplyScalar(speed / distance);
      else delta.set(0, 0, 0);
    } else delta.set(0, 0, 0);
    // Ease both steering and travel. Braking uses the same path when an action interrupts a walk.
    const turnBlend = 1 - Math.exp(-dt * 10);
    this.cat.root.rotation.y += desiredTurn * dt + (this.turnSpeed - desiredTurn) * turnBlend / 10;
    this.turnSpeed += (desiredTurn - this.turnSpeed) * turnBlend;
    const damping = delta.lengthSq() > this.moveVelocity.lengthSq() ? 5 : 8;
    const blend = 1 - Math.exp(-dt * damping);
    const step = this.moveVelocity.clone().multiplyScalar(blend / damping).addScaledVector(delta, dt - blend / damping);
    const before = position.clone();
    this.navigation.move(position, step);
    this.moveVelocity.lerp(delta, blend);
    // Animation uses actual travel after collision resolution, avoiding a walk against a wall.
    return dt > 0 ? position.distanceTo(before) / dt : 0;
  }

  updateRoom(dt) {
    let speed;
    const position = this.cat.root.position;
    this.robotBody.position.set(position.x, 0, position.z);
    this.robotBody.quaternion.setFromEuler(0, this.cat.root.rotation.y, 0);
    // 120 Hz keeps even a fast ball from tunnelling through thin furniture and walls.
    this.world.step(1 / 120, dt, 12);
    if (this.ball.visible && !this.carrying) {
      this.ball.position.copy(this.ballBody.position);
      this.ball.quaternion.copy(this.ballBody.quaternion);
    }
    if (this.state === 'chase') {
      const approach = this.ball.position.clone().sub(position).setY(0).normalize();
      const stoppingPoint = this.ball.position.clone().setY(0).addScaledVector(approach, -1.85);
      this.target.copy(this.navigation.nearest(stoppingPoint));
      speed = this.moveTo(this.target, dt, 1.9, this.ball.position);
      const ballDistance = Math.hypot(position.x - this.ball.position.x, position.z - this.ball.position.z);
      const facing = new THREE.Vector3(Math.sin(this.cat.root.rotation.y), 0, Math.cos(this.cat.root.rotation.y));
      const toBall = this.ball.position.clone().sub(position).setY(0).normalize();
      const closeToBall = ballDistance < PET_RADIUS + .36 && facing.dot(toBall) > .7;
      const clearPickup = closeToBall && this.navigation.clearLine(position, this.ball.position.clone().setY(0), .22);
      if (clearPickup && this.ball.position.y < .7 && this.ballBody.velocity.length() < 1.2) {
        this.carrying = true;
        this.pickupStart = this.ball.position.clone();
        this.ballBody.collisionResponse = false;
        this.ballBody.sleep();
        this.setState('retrieve', .8);
      } else if (this.time - this.fetchStarted > 35) {
        this.cancelBall(); this.setState('idle', 2); this.toast('球停在角落里了，再陪我抛一次吧');
      }
    } else if (this.state === 'retrieve') {
      if (this.time >= this.stateUntil) { this.target.copy(this.returnPoint); this.setState('return'); }
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
        this.target.copy(this.navigation.sample());
        this.setState('wander');
      } else if (this.state !== 'idle') this.setState('idle', 2);
    }
    if (speed === undefined) speed = this.moveTo(null, dt, 0);
    if (!['sleep', 'charging', 'dock'].includes(this.state)) {
      this.stats.energy = Math.max(0, this.stats.energy - dt * (speed > .1 ? .12 : .025));
      if (this.stats.energy < 3 && !['chase', 'retrieve', 'return'].includes(this.state)) { this.target.copy(this.dock); this.setState('dock'); }
    }
    this.cat.animate(this.time, speed, this.time < this.petUntil ? 'pet' : this.state, dt, this.reduced, (x, z) => {
      const cosine = Math.cos(this.cat.root.rotation.y), sine = Math.sin(this.cat.root.rotation.y);
      const worldX = position.x + x * cosine + z * sine;
      const worldZ = position.z - x * sine + z * cosine;
      const edge = Math.hypot(worldX - this.dock.x, worldZ - this.dock.z);
      return .034 * (1 - THREE.MathUtils.smoothstep(edge, 1.0, 1.14));
    }, this.turnSpeed);
    if (this.carrying) {
      this.cat.head.updateWorldMatrix(true, false);
      const mouth = this.cat.head.localToWorld(new THREE.Vector3(0, -.48, 1.04));
      const progress = this.state === 'retrieve' ? clamp(1 - (this.stateUntil - this.time) / .8, 0, 1) : 1;
      const ease = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
      this.ball.position.lerpVectors(this.pickupStart, mouth, ease);
    }
    this.studio.contact.position.set(position.x, .004, position.z);
    const desiredTarget = position.clone().add(new THREE.Vector3(0, 1.57, 0));
    const follow = desiredTarget.sub(this.controls.target).multiplyScalar(1 - Math.exp(-dt * 4));
    this.controls.target.add(follow);
    this.camera.position.add(follow);
    this.controls.update(dt);
    this.studio.updateCamera(this.camera, this.controls.target);
    this.studio.update(this.time, this.reduced);
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
