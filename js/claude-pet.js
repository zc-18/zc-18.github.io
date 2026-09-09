(() => {
  'use strict';
  if (window.__clPetBoot) return;
  window.__clPetBoot = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const random = (min, max) => min + Math.random() * (max - min);
  // Keep these indices in sync with tools/build-pet-badge.py (17 shared-crop poses).
  const clips = {
    wake: [[14, 450], [13, 220], [12, 180], [11, 200], [1, 100], [0, 280], [3, 130], [4, 140], [5, 220], [4, 140], [3, 130], [0, 260]],
    wave: [[3, 120], [4, 130], [5, 220], [4, 140], [5, 200], [4, 130], [3, 120], [15, 280], [0, 200]],
    blink: [[1, 75], [2, 100], [1, 75], [0, 180]],
    look: [[7, 160], [8, 800], [7, 160], [6, 650], [0, 250]],
    sleep: [[16, 240], [11, 240], [12, 280], [13, 300], [14, 6500], [13, 220], [12, 180], [11, 200], [0, 350]]
  };
  let atlas, companion, app, pending, generation = 0;
  let entryReady = document.readyState === 'complete';
  const loadAtlas = () => {
    if (!atlas) {
      const image = new Image();
      image.src = '/img/pet-badge.webp';
      atlas = image.decode().then(() => image.src).catch(e => { atlas = null; throw e; });
    }
    return atlas;
  };

  class PetCompanion {
    constructor(button) {
      this.button = button;
      this.ready = false;
      this.awake = false;
      this.floating = false;
      this.navigating = false;
      this.frame = 0;
      this.elapsed = 0;
      this.idleTime = 0;
      this.restTime = 2400;
      this.trips = 0;
      this.facing = 1;
      this.lift = 0;
      this.pointer = { x: -1000, y: -1000, time: 0 };
      this.cooldown = 0;
      this.sprite = document.createElement('span');
      this.sprite.className = 'cl-pet-sprite';
      this.sprite.setAttribute('aria-hidden', 'true');
      this.shadow = document.createElement('span');
      this.shadow.className = 'cl-pet-shadow';
      this.shadow.setAttribute('aria-hidden', 'true');
      this.hint = document.createElement('span');
      this.hint.className = 'cl-pet-invite';
      this.hint.textContent = '十七的小狗';
      this.hint.setAttribute('aria-hidden', 'true');
      button.append(this.shadow, this.sprite, this.hint);
      button.addEventListener('pointerenter', e => {
        if (e.pointerType === 'touch') return;
        this.hovered = true;
        if (!this.route?.target.home) this.respond('wave');
      });
      button.addEventListener('pointerleave', () => { this.hovered = false; this.idleTime = 0; });
      button.addEventListener('focus', () => {
        // Keep a keyboard target still; mouse focus restored by the room must not pin it forever.
        this.focused = button.matches(':focus-visible');
        this.respond('wave');
      });
      button.addEventListener('blur', () => { this.focused = false; this.idleTime = 0; });
      button.addEventListener('pointerdown', () => this.respond('wave'));
      this.attributes = new MutationObserver(() => this.sync());
      this.attributes.observe(button, { attributes: true, attributeFilter: ['aria-expanded', 'aria-busy'] });
      document.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        this.pointer = { x: e.clientX, y: e.clientY, time: performance.now() };
      }, { passive: true });
      document.addEventListener('pointerout', e => {
        if (!e.relatedTarget) this.pointer.x = -1000;
      }, { passive: true });
      window.addEventListener('resize', () => this.measure());
      window.visualViewport?.addEventListener('resize', () => this.measure());
      window.visualViewport?.addEventListener('scroll', () => this.measure());
      // Layout is read only after scrolling/resizing or choosing a destination, never per frame.
      window.addEventListener('scroll', () => {
        clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => this.measure(), 120);
      }, { passive: true });
    }

    bind(home) {
      this.home = home;
      const replacement = home.querySelector('.cl-pet-launch');
      if (replacement && replacement !== this.button) replacement.remove();
      if (!this.floating) home.append(this.button);
      this.recall = document.createElement('button');
      this.recall.type = 'button';
      this.recall.className = 'cl-pet-recall';
      this.recall.setAttribute('aria-label', '叫小伙伴回到这里');
      this.recall.title = '叫小伙伴回来';
      this.recall.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="5" cy="9" rx="2.2" ry="2.8"/><ellipse cx="10" cy="5.8" rx="2.2" ry="2.8"/><ellipse cx="15.5" cy="6.4" rx="2.2" ry="2.8"/><ellipse cx="19.5" cy="10.5" rx="2" ry="2.6"/><path d="M6.4 16.3c.3-2 2.9-5.8 5.3-5.8s5 3.3 5.7 5.3c1.4 4.3-3.1 4.6-5.4 3.4-2.1 1.3-6.4 1.1-5.6-2.9Z"/></svg>';
      this.recall.addEventListener('click', () => {
        if (!this.active() || !this.awake) return;
        this.measure();
        const r = this.home.getBoundingClientRect();
        if (r.bottom > 0) this.travel({ x: r.left, y: r.top, home: true });
      });
      home.append(this.recall);
      home.classList.toggle('cl-pet-away', this.floating);
      this.navigating = false;
      this.measure();
      this.sync();
    }

    active() {
      return this.ready && entryReady && !document.hidden && !this.navigating && !reducedMotion.matches &&
        this.button.getAttribute('aria-expanded') !== 'true' && this.button.getAttribute('aria-busy') !== 'true';
    }

    sync() {
      if (!reducedMotion.matches && !this.ready && !this.loading) {
        this.loading = true;
        loadAtlas().then(url => {
          this.sprite.style.backgroundImage = `url("${url}")`;
          this.ready = true;
          this.showFrame(this.awake ? 0 : 14);
          this.sync();
        }).catch(() => { /* Leave the original, clickable navigation image intact. */ });
      }
      this.button.classList.toggle('cl-pet-animated', this.ready && !reducedMotion.matches);
      this.button.classList.toggle('cl-pet-room-hidden', this.button.getAttribute('aria-expanded') === 'true');
      if (reducedMotion.matches || !this.ready) this.dock();
      if (!this.active()) { this.pause(); return; }
      this.button.classList.remove('cl-pet-paused');
      if (!this.frame) {
        this.lastTime = performance.now();
        this.frame = requestAnimationFrame(t => this.tick(t));
      }
    }

    pause() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.button.classList.add('cl-pet-paused');
    }

    float() {
      if (this.floating || !this.home?.isConnected) return;
      const r = this.button.getBoundingClientRect();
      this.x = r.left;
      this.y = r.top;
      this.atHome = true;
      document.body.append(this.button);
      this.button.classList.add('cl-pet-roaming');
      this.home.classList.add('cl-pet-away');
      this.floating = true;
      this.measure();
      this.paint();
    }

    dock() {
      if (!this.home?.isConnected) return;
      this.home.append(this.button);
      this.home.classList.remove('cl-pet-away', 'cl-pet-occupied');
      this.button.classList.remove('cl-pet-roaming');
      this.button.style.removeProperty('transform');
      this.floating = false;
      this.route = null;
      this.clip = null;
      this.lift = 0;
      this.setAction('idle');
      this.showFrame(0);
      this.pose(0, 1, 1, 0);
    }

    measure() {
      const view = window.visualViewport;
      const previous = this.bounds;
      this.bounds = {
        left: (view?.offsetLeft || 0) + 8,
        top: (view?.offsetTop || 0) + 10,
        right: (view?.offsetLeft || 0) + (view?.width || innerWidth) - 48,
        bottom: (view?.offsetTop || 0) + (view?.height || innerHeight) - 54
      };
      const resized = previous && Object.keys(previous).some(key => previous[key] !== this.bounds[key]);
      if (this.route && resized) {
        this.route = null;
        this.play('look');
      }
      if (this.floating) {
        const home = this.home?.getBoundingClientRect();
        if (this.atHome && home && home.top >= 0) {
          this.x = home.left;
          this.y = home.top;
        } else this.atHome = false;
        const x = clamp(this.x, this.bounds.left, this.bounds.right);
        const y = clamp(this.y, this.bounds.top, this.bounds.bottom);
        if (x !== this.x || y !== this.y) {
          this.x = x; this.y = y;
          this.route = null;
          this.play('look');
          this.paint();
        }
      }
      // Avoid resting on page controls, especially the mobile menu and AI launcher.
      this.obstacles = [...document.querySelectorAll('#menus, #rightside, #ai-launcher, .cl-pet-home, .nav-site-title')]
        .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height && r.bottom > 0 && r.top < innerHeight);
      if (resized && this.floating && !this.atHome && (this.y < this.bounds.top + 68 || this.obstacles.some(r =>
        this.x + 44 > r.left && this.x - 4 < r.right && this.y + 40 > r.top && this.y < r.bottom))) {
        // A mobile header can reflow beneath a resting pet. Give its controls room.
        this.y = clamp(this.y, this.bounds.top + 68, this.bounds.bottom - 80);
      }
      if (this.floating) this.paint();
    }

    setAction(name) { this.button.dataset.petAction = name; }
    showFrame(index) {
      if (this.poseIndex === index) return;
      this.poseIndex = index;
      this.sprite.style.backgroundPosition = `${index * 100 / 16}% 0`;
    }
    pose(lift, sx, sy, angle) {
      const transform = `translateY(${-lift.toFixed(2)}px) rotate(${angle.toFixed(2)}deg) scale(${(sx * this.facing).toFixed(3)}, ${sy.toFixed(3)})`;
      if (transform === this.lastPose) return;
      this.lastPose = transform;
      this.sprite.style.transform = transform;
      this.shadow.style.transform = `scale(${(1 - Math.min(lift, 12) / 28).toFixed(3)})`;
      this.shadow.style.opacity = (.2 - Math.min(lift, 12) / 100).toFixed(3);
    }
    paint() {
      this.button.style.transform = `translate3d(${this.x.toFixed(2)}px, ${this.y.toFixed(2)}px, 0)`;
      this.home?.classList.toggle('cl-pet-occupied', this.atHome);
      this.button.classList.toggle('cl-pet-hint-left', this.x > innerWidth / 2);
      this.button.classList.toggle('cl-pet-hint-below', this.y < 60);
    }

    play(name) {
      this.route = null;
      this.clip = { name, index: 0, time: 0 };
      this.setAction(name);
      this.showFrame(clips[name][0][0]);
    }

    respond(name) {
      if (!this.active() || !this.awake) return;
      if (!this.floating) this.float();
      this.cooldown = 6000;
      this.idleTime = 0;
      this.restTime = random(4500, 6500);
      if (this.clip?.name !== 'wave') this.play(name);
    }

    chooseDestination() {
      this.measure();
      const b = this.bounds;
      const header = document.querySelector('#page-header')?.getBoundingClientRect();
      const openHero = header && header.bottom > innerHeight * .55;
      const candidates = [];
      for (let i = 0; i < 24; i++) {
        let x, y;
        if (openHero && i % 3 === 0) {
          x = random(b.left, b.right);
          y = random(Math.max(b.top + 65, 85), Math.min(b.bottom, header.bottom - 64));
        } else if (i % 3 === 1) {
          x = i % 2 ? b.left + random(0, 18) : b.right - random(0, 18);
          y = random(Math.max(b.top, 90), b.bottom - 50);
        } else {
          x = random(b.left, b.right - 70);
          y = i % 2 ? b.bottom - random(8, 30) : Math.max(b.top, 76);
        }
        const distance = Math.hypot(x - this.x, y - this.y);
        const blocked = this.obstacles.some(r => x + 46 > r.left - 10 && x - 6 < r.right + 10 && y + 44 > r.top - 8 && y < r.bottom + 8);
        if (!blocked && distance > 110) candidates.push({ x, y, distance });
      }
      // Prefer nearby excursions, with occasional longer crossings to explore the whole page.
      const nearby = candidates.filter(p => p.distance < (innerWidth < 600 ? 340 : 620));
      const pool = nearby.length && this.trips % 4 !== 3 ? nearby : candidates;
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    travel(target) {
      this.float();
      this.atHome = false;
      this.clip = null;
      this.lift = 0;
      this.route = { target, hop: null };
      this.setAction('roam');
      this.nextHop();
    }

    nextHop() {
      const target = this.route.target;
      const dx = target.x - this.x, dy = target.y - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        this.route = null;
        this.atHome = !!target.home;
        this.trips++;
        this.idleTime = 0;
        this.restTime = target.home ? 11000 : random(3800, 7000);
        this.play(target.home ? 'wave' : (this.trips % 4 === 0 ? 'sleep' : 'look'));
        return;
      }
      const stride = Math.min(distance, innerWidth < 600 ? 52 : 68);
      this.route.hop = {
        x: this.x, y: this.y, endX: this.x + dx / distance * stride,
        endY: this.y + dy / distance * stride, time: 0,
        duration: 520 + (stride / 68) * 100,
        facing: Math.abs(dx) > 3 ? (dx > 0 ? -1 : 1) : this.facing,
        fromFacing: this.facing
      };
    }

    move(dt) {
      const hop = this.route.hop;
      hop.time += dt;
      const t = Math.min(1, hop.time / hop.duration);
      // Anticipation (feet planted), ballistic flight, then a damped landing.
      // Translation only happens in flight, so the paws never skate along the page.
      const flight = clamp((t - .18) / .64, 0, 1);
      const progress = smooth(flight);
      this.x = mix(hop.x, hop.endX, progress);
      this.y = mix(hop.y, hop.endY, progress);
      this.facing = mix(hop.fromFacing, hop.facing, smooth(Math.min(t / .16, 1)));
      let squash = 0, angle = 0;
      if (t < .18) {
        squash = Math.sin(t / .18 * Math.PI) * .09;
        this.showFrame(10);
      } else if (t < .82) {
        this.showFrame(9);
        angle = Math.sin(flight * Math.PI * 2) * 3 * -hop.facing;
      } else {
        this.showFrame(10);
        squash = Math.sin((t - .82) / .18 * Math.PI) * .12;
      }
      this.lift = Math.sin(flight * Math.PI) * 7;
      this.pose(this.lift, 1 + squash * .5, 1 - squash, angle);
      this.paint();
      if (t === 1) this.nextHop();
    }

    tick(now) {
      this.frame = 0;
      if (!this.active()) { this.sync(); return; }
      // Drop elapsed background/stall time; never teleport to catch up.
      const dt = Math.min(40, now - this.lastTime);
      this.lastTime = now;
      this.elapsed += dt;
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (!this.awake) {
        if (this.elapsed > 900) {
          this.float();
          this.awake = true;
          this.play('wake');
        }
      } else {
        if (!this.floating) this.float();
        if (!this.cooldown && !this.route?.target.home && now - this.pointer.time > 280 &&
            Math.hypot(this.x + 20 - this.pointer.x, this.y + 20 - this.pointer.y) < 85) this.respond('look');
        if (this.route) this.move(dt);
        else {
          // A hover can interrupt a hop: settle vertically without moving the click target.
          this.lift *= Math.exp(-dt / 65);
          this.facing = this.facing < 0 ? -1 : 1;
          const breath = this.clip?.name === 'sleep' || !this.clip ? Math.sin(this.elapsed / 650) * .008 : 0;
          this.pose(this.lift, 1, 1 + breath, 0);
          if (this.clip) {
            this.clip.time += dt;
            const sequence = clips[this.clip.name];
            if (this.clip.time >= sequence[this.clip.index][1]) {
              this.clip.time -= sequence[this.clip.index][1];
              if (++this.clip.index === sequence.length) {
                this.clip = null;
                this.setAction('idle');
                this.showFrame(0);
              } else this.showFrame(sequence[this.clip.index][0]);
            }
          } else if (!this.hovered && !this.focused) {
            this.idleTime += dt;
            if (this.idleTime >= this.restTime) {
              const target = this.chooseDestination();
              if (target) this.travel(target);
              this.idleTime = 0;
            } else if (this.idleTime > 1800 && !this.blinked) {
              this.blinked = true;
              this.play('blink');
            }
          }
        }
      }
      if (this.route) this.blinked = false;
      this.frame = requestAnimationFrame(t => this.tick(t));
    }
  }

  const sync = () => companion?.sync();
  const ready = () => { entryReady = true; sync(); };
  window.addEventListener('load', ready, { once: true });
  // Unrelated external cover/font requests must not leave the decoded pet asleep forever.
  setTimeout(ready, 3500);
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('pagehide', () => companion?.pause());
  window.addEventListener('pageshow', sync);
  const error = () => {
    if (document.querySelector('.cl-pet-error')) return;
    const message = document.createElement('div');
    message.className = 'cl-pet-error';
    message.setAttribute('role', 'status');
    message.textContent = '3D 伙伴暂时无法启动，请检查浏览器的硬件加速或稍后重试。';
    document.body.append(message);
    setTimeout(() => message.remove(), 6000);
  };
  const load = () => {
    if (!pending) pending = import('/js/claude-pet/experience.js').then(({ PetExperience }) => {
      app = new PetExperience();
      return app;
    }).catch(e => { pending = null; console.warn('[pet] 3D unavailable', e); throw e; });
    return pending;
  };
  const init = () => {
    generation++;
    const home = document.querySelector('.cl-pet-home');
    if (!home) return;
    if (!companion) companion = new PetCompanion(home.querySelector('.cl-pet-launch'));
    home.querySelector('.cl-pet-recall')?.remove();
    companion.bind(home);
    companion.button.setAttribute('aria-expanded', String(!!app?.room));
  };
  document.addEventListener('click', e => {
    const button = e.target.closest('.cl-pet-launch');
    if (!button) return;
    e.preventDefault();
    if (button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    const token = generation;
    const loading = document.createElement('div');
    loading.className = 'cl-pet-loading';
    loading.setAttribute('role', 'status');
    loading.innerHTML = '<img src="/img/pet-original.png" alt="" width="64" height="64"><span>正在打开小屋</span>';
    document.body.append(loading);
    load().then(pet => { if (token === generation) pet.open(); }).catch(error).finally(() => {
      button.removeAttribute('aria-busy');
      loading.remove();
    });
  });
  document.addEventListener('pjax:send', () => {
    generation++;
    if (companion) {
      // Preserve this exact button and animation phase across page replacement.
      if (!companion.floating) companion.float();
      companion.navigating = true;
      companion.pause();
      companion.route = null;
      companion.clip = null;
      companion.hovered = false;
      companion.focused = false;
      companion.idleTime = 0;
      companion.setAction('idle');
      companion.showFrame(0);
    }
    if (app) app.suspend();
  });
  document.addEventListener('pjax:complete', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
