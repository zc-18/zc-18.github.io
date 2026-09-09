(() => {
  'use strict';
  if (window.__clPetBoot) return;
  window.__clPetBoot = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Frame indices match tools/build-pet-badge.py. Only this small atlas loads on entry.
  const wave = [[3, 150], [4, 160], [5, 240], [4, 160], [5, 240], [4, 160], [3, 150], [0, 300]];
  const clips = {
    welcome: [...wave, [7, 140], [8, 260], [9, 180], [10, 180], [8, 240], [7, 160], [0, 400]],
    wave,
    blink: [[1, 90], [2, 120], [1, 90], [0, 160]],
    look: [[6, 900], [0, 240], [7, 160], [8, 700], [7, 160], [0, 200]]
  };
  let atlas, badges = [];
  const loadAtlas = () => {
    if (!atlas) {
      const image = new Image();
      image.src = '/img/pet-badge.webp';
      atlas = image.decode().then(() => image.src).catch(e => { atlas = null; throw e; });
    }
    return atlas;
  };

  class PetBadge {
    constructor(button) {
      this.button = button;
      this.visible = false;
      this.ready = false;
      this.greeted = false;
      this.playing = false;
      this.disposed = false;
      this.idleCount = 0;
      this.timer = 0;
      this.sprite = document.createElement('span');
      this.sprite.className = 'cl-pet-sprite';
      this.sprite.setAttribute('aria-hidden', 'true');
      button.append(this.sprite);
      this.events = new AbortController();
      const options = { signal: this.events.signal };
      button.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') this.respond(); }, options);
      button.addEventListener('focus', () => this.respond(), options);
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries[0].intersectionRatio >= .95;
        this.sync();
      }, { threshold: .95 });
      this.observer.observe(button);
      this.attributes = new MutationObserver(() => this.sync());
      this.attributes.observe(button, { attributes: true, attributeFilter: ['aria-expanded', 'aria-busy'] });
      this.sync();
    }

    active() {
      return !this.disposed && this.button.isConnected && this.visible && !document.hidden &&
        !reducedMotion.matches && this.button.getAttribute('aria-expanded') !== 'true' &&
        this.button.getAttribute('aria-busy') !== 'true';
    }

    sync() {
      if (this.disposed) return;
      this.button.classList.toggle('cl-pet-animated', this.ready && !reducedMotion.matches);
      if (!this.active()) {
        this.stop();
        return;
      }
      if (!this.ready) {
        if (!this.loading) {
          this.loading = true;
          loadAtlas().then(url => {
            if (this.disposed) return;
            this.sprite.style.backgroundImage = `url("${url}")`;
            this.ready = true;
            this.sync();
          }).catch(() => { /* Keep the original image if the atlas is unavailable. */ });
        }
        return;
      }
      this.button.classList.remove('cl-pet-paused');
      if (!this.timer && !this.playing) {
        // Let Butterfly's header entrance settle before waving.
        if (!this.greeted) this.schedule(() => this.play('welcome'), 900);
        else this.rest();
      }
    }

    schedule(callback, delay) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = 0;
        if (this.active()) callback();
        else this.stop();
      }, delay);
    }

    showFrame(frame) {
      this.sprite.style.backgroundPosition = `${frame * 10}% 0`;
    }

    play(name) {
      if (!this.active() || !this.ready) return;
      clearTimeout(this.timer);
      this.timer = 0;
      this.greeted = true;
      this.playing = true;
      this.button.dataset.petAction = name;
      let index = 0;
      const next = () => {
        const pose = clips[name][index++];
        if (!pose) { this.rest(); return; }
        this.showFrame(pose[0]);
        this.schedule(next, pose[1]);
      };
      next();
    }

    rest() {
      this.playing = false;
      this.button.dataset.petAction = 'idle';
      this.showFrame(0);
      this.schedule(() => this.play(++this.idleCount % 3 === 0 ? 'look' : 'blink'), 2800 + Math.random() * 2200);
    }

    respond() {
      if (!this.active() || !this.ready || this.playing) return;
      this.play(this.greeted ? 'wave' : 'welcome');
    }

    stop() {
      clearTimeout(this.timer);
      this.timer = 0;
      this.playing = false;
      this.showFrame(0);
      this.button.dataset.petAction = 'idle';
      this.button.classList.add('cl-pet-paused');
    }

    dispose() {
      this.disposed = true;
      this.stop();
      this.events.abort();
      this.observer.disconnect();
      this.attributes.disconnect();
      this.sprite.remove();
      this.button.classList.remove('cl-pet-animated', 'cl-pet-paused');
      delete this.button.dataset.petAction;
    }
  }

  const clearBadges = () => {
    badges.forEach(badge => badge.dispose());
    badges = [];
  };
  const syncBadges = () => badges.forEach(badge => badge.sync());
  document.addEventListener('visibilitychange', syncBadges);
  reducedMotion.addEventListener('change', syncBadges);
  window.addEventListener('pagehide', () => badges.forEach(badge => badge.stop()));
  window.addEventListener('pageshow', syncBadges);
  let app, pending, generation = 0;
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
    clearBadges();
    document.querySelectorAll('.cl-pet-launch').forEach(button => {
      button.setAttribute('aria-expanded', String(!!app?.room));
      badges.push(new PetBadge(button));
    });
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
    loading.innerHTML = '<img src="/img/pet-original.png" alt="" width="64" height="64"><span>正在唤醒伙伴</span>';
    document.body.append(loading);
    load().then(pet => { if (token === generation) pet.open(); }).catch(error).finally(() => {
      button.removeAttribute('aria-busy');
      loading.remove();
    });
  });
  document.addEventListener('pjax:send', () => { generation++; clearBadges(); if (app) app.suspend(); });
  document.addEventListener('pjax:complete', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
