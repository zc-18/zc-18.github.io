import * as THREE from '../lib/pet/three.module.js';

const smooth = u => u * u * u * (u * (u * 6 - 15) + 10);
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));

// Orbit owns an unobstructed rig. Collision only changes the rendered camera,
// so brushing a wall never ratchets the user's zoom closer on every frame.
export class RoomCamera {
  constructor(pet) {
    this.pet = pet;
    this.rig = pet.controls.object;
    this.mode = 'free';
    this.previous = new THREE.Vector3();
    this.initialized = false;
    this.lookAhead = new THREE.Vector3();
  }

  flush() {
    const controls = this.pet.controls;
    controls.enableDamping = false;
    controls.update(0);
    controls.enableDamping = true;
  }

  manual(start = false) {
    this.flight = null;
    this.item = null;
    this.mode = this.pet.skyView ? 'sky' : 'manual';
    this.dragging = start;
    this.resumeAt = this.pet.time + 3;
    this.pet.controls.autoRotate = false;
    this.pet.updateHUD();
  }

  endManual() {
    // Orbit's pointerup listener runs after picking. Do not cancel a new shot
    // created by the furniture click that just completed this same gesture.
    this.dragging = false;
    this.resumeAt = this.pet.time + 3;
  }

  transition(target, offset, mode, snap = false) {
    this.flush();
    const controls = this.pet.controls;
    this.mode = mode;
    this.dragging = false;
    this.flight = {
      start: this.pet.time, targetFrom: controls.target.clone(), target: target.clone(),
      from: new THREE.Spherical().setFromVector3(this.rig.position.clone().sub(controls.target)),
      to: new THREE.Spherical().setFromVector3(offset)
    };
    if (snap || !this.initialized || this.pet.reduced) {
      controls.target.copy(target);
      this.rig.position.copy(target).add(offset);
      this.flight = null;
      this.render(true);
    }
  }

  reset(snap = false) {
    const pet = this.pet;
    pet.skyView = false;
    pet.controls.autoRotate = false;
    pet.controls.maxPolarAngle = Math.PI / 2 - .04;
    this.item = null;
    this.lookAhead.set(0, 0, 0);
    const target = pet.followPet ? pet.cat.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)) : new THREE.Vector3(0, 1.3, -.25);
    this.transition(target, new THREE.Vector3(...(pet.mobile ? [1.8, 3.6, 9.4] : [3.8, 3.5, 10])), pet.followPet ? 'follow' : 'free', snap);
    pet.host.querySelector('[data-action="sky"]').setAttribute('aria-pressed', 'false');
    pet.updateHUD();
  }

  stars() {
    const pet = this.pet;
    pet.skyView = true;
    pet.controls.autoRotate = false;
    pet.controls.maxPolarAngle = Math.PI - .4;
    this.item = null;
    this.transition(new THREE.Vector3(-1.5, 7.25, -1.5), new THREE.Vector3(0, -4.75, 9.1), 'sky');
    pet.host.querySelector('[data-action="sky"]').setAttribute('aria-pressed', 'true');
    pet.updateHUD();
  }

  activityTarget(item) {
    const pet = this.pet;
    const target = pet.cat.root.position.clone().lerp(item.focus, .25);
    return target.setY(Math.max(pet.cat.root.position.y + 1.15, Math.min(2.5, item.focus.y * .4 + .9)));
  }

  frame(item) {
    const pet = this.pet;
    pet.skyView = false;
    pet.controls.autoRotate = false;
    pet.controls.maxPolarAngle = Math.PI / 2 - .04;
    pet.host.querySelector('[data-action="sky"]').setAttribute('aria-pressed', 'false');
    this.item = item;
    const outward = item.approach.clone().sub(item.focus).setY(0);
    if (outward.lengthSq() < .1) outward.copy(this.rig.position).sub(pet.controls.target).setY(0);
    outward.normalize().multiplyScalar(pet.mobile ? 7.4 : 8.2).add(new THREE.Vector3(.6, 3.1, 0));
    this.transition(this.activityTarget(item), outward, 'activity');
    pet.updateHUD();
  }

  release() {
    if (this.mode !== 'activity') return;
    this.item = null;
    this.flight = null;
    this.mode = this.pet.followPet ? 'follow' : 'free';
  }

  follow(enabled) {
    this.pet.followPet = enabled;
    if (!enabled) { this.release(); if (this.mode === 'follow') this.mode = 'free'; return; }
    this.pet.skyView = false;
    this.pet.controls.maxPolarAngle = Math.PI / 2 - .04;
    this.pet.controls.autoRotate = false;
    this.pet.host.querySelector('[data-action="sky"]').setAttribute('aria-pressed', 'false');
    this.item = null;
    const offset = this.rig.position.clone().sub(this.pet.controls.target);
    if (offset.y < 1) offset.y = 3.2;
    this.transition(this.pet.cat.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)), offset, 'follow');
  }

  update(dt) {
    const pet = this.pet, controls = pet.controls;
    if (this.mode === 'manual' && pet.followPet && !this.dragging && pet.time >= this.resumeAt) this.mode = 'follow';
    if (this.flight) {
      const shot = this.flight;
      if (this.mode === 'activity' && this.item) shot.target.copy(this.activityTarget(this.item));
      if (this.mode === 'follow') shot.target.copy(pet.cat.root.position).y += 1.15;
      const u = pet.reduced ? 1 : THREE.MathUtils.clamp((pet.time - shot.start) / 1.25, 0, 1), ease = smooth(u);
      const orbit = new THREE.Spherical(
        THREE.MathUtils.lerp(shot.from.radius, shot.to.radius, ease),
        THREE.MathUtils.lerp(shot.from.phi, shot.to.phi, ease),
        shot.from.theta + angle(shot.to.theta - shot.from.theta) * ease
      );
      controls.target.lerpVectors(shot.targetFrom, shot.target, ease);
      this.rig.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(orbit));
      if (u === 1) this.flight = null;
    } else if ((this.mode === 'activity' && this.item) || this.mode === 'follow') {
      let desired;
      if (this.mode === 'activity') desired = this.activityTarget(this.item);
      else {
        this.lookAhead.lerp(pet.moveVelocity.clone().multiplyScalar(.28).clampLength(0, .4), 1 - Math.exp(-dt * 2));
        desired = pet.cat.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)).add(this.lookAhead);
      }
      // A small dead zone absorbs breathing and tiny arrival corrections.
      const delta = desired.sub(controls.target), length = delta.length();
      if (length > .045) {
        delta.multiplyScalar((length - .045) / length * (1 - Math.exp(-dt * 2.8)));
        controls.target.add(delta);
        this.rig.position.add(delta);
      }
    }
    controls.dampingFactor = 1 - Math.exp(-dt * 9);
    controls.update(dt);
    this.render(false, dt);
  }

  render(snap = false, dt = 1 / 60) {
    const pet = this.pet;
    const fov = pet.skyView ? (pet.mobile ? 74 : 68) : pet.camera.aspect < .8 ? 64 : pet.camera.aspect > 1.8 ? 54 : 58;
    pet.camera.fov = snap || pet.reduced ? fov : THREE.MathUtils.damp(pet.camera.fov, fov, 5, dt);
    pet.camera.updateProjectionMatrix();
    this.rig.fov = pet.camera.fov;
    this.rig.aspect = pet.camera.aspect;
    this.rig.updateProjectionMatrix();
    pet.camera.position.copy(this.rig.position);
    pet.studio.updateCamera(pet.camera, pet.controls.target, !snap && this.initialized ? this.previous : null, 18 * dt);
    this.previous.copy(pet.camera.position);
    this.initialized = true;
  }
}
