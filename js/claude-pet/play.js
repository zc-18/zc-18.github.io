import * as THREE from '../lib/pet/three.module.js';
import { RoomAudio } from './audio.js';

const smooth = value => value * value * value * (value * (value * 6 - 15) + 10);
const messages = {
  snack: '小零食真香 · 电量 +18', read: '小狗听完故事，把头轻轻靠近你',
  music: '把快乐踩成小小的节拍', lamp: '阅读角亮起来了，心也暖起来了',
  gym: '绒球晃呀晃，小爪子也跟着忙', yarn: '发现了最喜欢的薄荷色毛线',
  train: '呜——小火车把好心情送到家', blocks: '今天也是一位小小建筑师',
  welcome: '欢迎回家！我一直在等你', bunny: '兔兔说：明天也要一起玩',
  forest: '收藏了林间的晨光，和一阵青草香', coast: '听见海浪，也收藏了一个晴天',
  bubbles: '泡泡里藏着小小彩虹', bed: '软软的窝，甜甜的梦'
};

export class RoomPlay {
  constructor(pet) {
    this.pet = pet;
    this.props = pet.studio.activities;
    this.items = this.props.items;
    this.items.forEach(item => { item.approach = pet.navigation.nearest(item.preferred); });
    this.audio = new RoomAudio();
    this.album = { visits: [], treasures: 0, bubbles: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem('cl-pet-album-v1'));
      if (saved) {
        this.album.visits = [...new Set((Array.isArray(saved.visits) ? saved.visits : []).filter(id => this.items.some(item => item.id === id)))];
        for (const key of ['treasures', 'bubbles']) if (Number.isFinite(saved[key])) this.album[key] = THREE.MathUtils.clamp(Math.floor(saved[key]), 0, 99999);
      }
    } catch (_) { /* Play remains available without storage. */ }
    this.panel = document.createElement('div');
    this.panel.className = 'cl-pet-explore'; this.panel.id = 'cl-pet-explore'; this.panel.hidden = true;
    this.panel.setAttribute('role', 'region'); this.panel.setAttribute('aria-label', '小窝漫游手册');
    this.panel.innerHTML = `<div class="cl-pet-explore-title"><div><small>MAKE YOURSELF AT HOME</small><h3>今天，想玩点什么？</h3></div><button type="button" data-action="explore" aria-label="收起漫游手册">×</button></div>
      <p class="cl-pet-collection"></p><div class="cl-pet-collection-bar"><span></span></div>
      <p class="cl-pet-panel-help">轻点房间里的物品，或选一个小日常。小狗会自己走过去。</p>
      <div class="cl-pet-activity-list"><div class="cl-pet-tricks"><button type="button" data-action="trick:shake">握个爪</button><button type="button" data-action="trick:stretch">伸懒腰</button><button type="button" data-action="trick:watch">歪头看看</button></div>${this.items.map((item, i) => `<button type="button" data-action="visit:${item.id}" title="${item.detail}"><span class="cl-pet-activity-number">${String(i + 1).padStart(2, '0')}</span><span>${item.label}<small>${item.detail}</small></span><span class="cl-pet-stamp" aria-hidden="true">○</span></button>`).join('')}</div>
      <div class="cl-pet-extra-actions"><button type="button" data-action="hunt">全屋寻宝</button><button type="button" data-action="next-treasure" hidden>找下一颗星</button><button type="button" data-action="follow" aria-pressed="false">跟随小狗</button><button type="button" data-action="sound" aria-pressed="false">开启声音</button><button type="button" data-action="quality" aria-pressed="false">省电画质</button></div>
      <p class="cl-pet-album-score"></p>`;
    pet.hud.append(this.panel);
    this.tooltip = document.createElement('div'); this.tooltip.className = 'cl-pet-object-tip'; this.tooltip.hidden = true;
    pet.hud.append(this.tooltip);
    this.progress = document.createElement('div'); this.progress.className = 'cl-pet-activity-progress'; this.progress.hidden = true;
    this.progress.innerHTML = '<span></span><button type="button" data-action="cancel-activity" aria-label="停止当前活动">×</button><div><i></i></div>';
    pet.hud.append(this.progress);
    this.refresh();
  }

  handle(action) {
    const pet = this.pet;
    if (action.startsWith('visit:')) { this.visit(action.slice(6)); return true; }
    if (action.startsWith('trick:')) {
      const pose = action.slice(6);
      if (!['shake', 'stretch', 'watch'].includes(pose)) return true;
      this.interrupt(() => {
        this.trick = pose;
        pet.setState('trick', pose === 'stretch' ? 5 : 4);
        this.closePanel();
        pet.frameActivity({ approach: pet.cat.root.position, focus: pet.cat.root.position.clone().setY(1.3) });
        pet.toast(pose === 'shake' ? '把小爪交给你' : pose === 'stretch' ? '前爪伸一伸，尾巴摇一摇' : '咦，你在看什么呀？');
      });
      return true;
    }
    if (action === 'explore') {
      this.panel.hidden = !this.panel.hidden;
      pet.host.classList.toggle('cl-pet-exploring', !this.panel.hidden);
      pet.host.querySelector('[data-action="explore"]').setAttribute('aria-expanded', String(!this.panel.hidden));
      if (!this.panel.hidden) this.panel.querySelector('button').focus();
      else pet.host.querySelector('[data-action="explore"]').focus();
    } else if (action === 'cancel-activity') this.interrupt(() => pet.setState('idle', 3));
    else if (action === 'follow') {
      pet.followPet = !pet.followPet;
      if (pet.followPet) { pet.skyView = false; pet.resetCamera(); }
      this.panel.querySelector('[data-action="follow"]').setAttribute('aria-pressed', String(pet.followPet));
      pet.toast(pet.followPet ? '镜头会轻轻跟随小狗' : '自由环顾整间小屋');
    } else if (action === 'sound') {
      try {
        const enabled = this.audio.toggle();
        this.panel.querySelector('[data-action="sound"]').setAttribute('aria-pressed', String(enabled));
        this.panel.querySelector('[data-action="sound"]').textContent = enabled ? '关闭声音' : '开启声音';
        pet.toast(enabled ? '把音量放轻一点，听听小窝的旋律' : '安静地陪着你');
      } catch (_) { pet.toast('这个浏览器暂时无法播放声音'); }
    } else if (action === 'quality') {
      pet.lowPower = !pet.lowPower; pet.width = 0; pet.resize();
      this.panel.querySelector('[data-action="quality"]').setAttribute('aria-pressed', String(pet.lowPower));
      pet.toast(pet.lowPower ? '已减少光影细节，操作更轻快' : '已恢复精细光影');
    } else if (action === 'hunt') this.startHunt();
    else if (action === 'next-treasure') {
      const index = this.props.tokens.findIndex(root => root.visible);
      if (index >= 0) this.seek(index);
    } else return false;
    return true;
  }

  closePanel() {
    this.panel.hidden = true;
    this.pet.host.classList.remove('cl-pet-exploring');
    this.pet.host.querySelector('[data-action="explore"]').setAttribute('aria-expanded', 'false');
    this.tooltip.hidden = true;
  }

  visit(id, automatic = false) {
    const item = this.items.find(entry => entry.id === id);
    if (!item) return;
    this.interrupt(() => {
      this.active = item; this.startedWalking = this.pet.time;
      this.pet.target.copy(item.approach); this.pet.setState('visit');
      this.pet.marker.position.copy(item.approach).setY(.02); this.pet.marker.visible = true;
      this.pet.toast('去' + item.label + ' · 再点其他物品可以换目标');
      if (!automatic) {
        this.pet.frameActivity(item);
        this.closePanel(); this.pet.renderer.domElement.focus({ preventScroll: true });
      }
    });
  }

  interrupt(next = () => {}) {
    const pet = this.pet;
    if (this.transfer) { this.queued = next; return; }
    if (this.onBed) { this.queued = next; this.beginTransfer(false); return; }
    this.active = null; this.treasure = null; this.trick = null; this.props.stop();
    pet.cancelBall(); pet.manualMove = false; pet.marker.visible = false;
    pet.pathTarget = null; next();
  }

  beginTransfer(enter) {
    const bed = this.items.find(item => item.id === 'bed');
    this.transfer = { enter, start: this.pet.time, from: this.pet.cat.root.position.clone(), to: (enter ? bed.landing : bed.approach).clone(), angle: this.pet.cat.root.rotation.y };
    this.pet.moveVelocity.set(0, 0, 0); this.pet.turnSpeed = 0;
    this.pet.setState(enter ? 'hop-bed' : 'leave-bed');
    this.pet.marker.visible = false;
  }

  award(item) {
    const first = !this.album.visits.includes(item.id);
    if (first) this.album.visits.push(item.id);
    this.pet.stats.affection = Math.min(100, this.pet.stats.affection + item.reward);
    this.pet.toast((messages[item.id] || '又发现一种新的快乐') + (first ? ' · 新日常已收藏' : ''));
    this.audio.tone(659.25, .5, .22);
    this.refresh(); this.save(); this.pet.save();
  }

  startHunt() {
    this.interrupt(() => {
      const positions = [];
      for (let i = 0; i < 3; i++) {
        let candidates = this.pet.navigation.nodes.filter(node => node.point.distanceTo(this.pet.cat.root.position) > 2 && positions.every(point => point.distanceTo(node.point) > 5));
        if (!candidates.length) candidates = this.pet.navigation.nodes;
        const point = candidates[Math.floor(Math.random() * candidates.length)].point.clone(); positions.push(point);
        this.props.tokens[i].position.copy(point); this.props.tokens[i].visible = true;
      }
      this.pet.setState('idle', 20); this.closePanel(); this.refresh();
      this.pet.toast('藏好了 3 颗星星 · 轻点星星，小狗会跑去找');
    });
  }

  seek(index) {
    const token = this.props.tokens[index];
    if (!token?.visible) return;
    this.interrupt(() => {
      this.treasure = index; this.pet.target.copy(token.position).setY(0);
      this.pet.setState('treasure'); this.closePanel();
      this.pet.frameActivity({ approach: this.pet.target, focus: this.pet.target.clone().setY(1.3) });
      this.pet.marker.position.copy(this.pet.target).setY(.02); this.pet.marker.visible = true;
    });
  }

  hit(event, click = false) {
    const pet = this.pet, rect = pet.renderer.domElement.getBoundingClientRect();
    pet.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    pet.raycaster.setFromCamera(pet.pointer, pet.camera);
    // Raycaster does not prune invisible ancestors: explicitly reject them.
    const hit = pet.raycaster.intersectObjects([pet.cat.root, pet.stage], true).find(hit => {
      for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
      return hit.object !== pet.marker && hit.object !== pet.studio.contact;
    });
    let object = hit?.object, id, bubble, treasure, dog, command;
    while (object) {
      id ||= object.userData.activity;
      bubble ??= object.userData.bubble;
      treasure ??= object.userData.treasure;
      dog ||= object === pet.cat.root;
      command ||= object.userData.activityCommand;
      object = object.parent;
    }
    const item = this.items.find(item => item.id === id);
    const label = dog ? '摸摸小狗' : item?.label || (command ? '回充电座' : bubble !== undefined ? '戳破泡泡 +1' : treasure !== undefined ? '去找这颗星星' : '');
    this.tooltip.hidden = !label || !this.panel.hidden || event.pointerType === 'touch';
    this.tooltip.textContent = label;
    this.tooltip.style.left = Math.min(innerWidth - 170, Math.max(12, event.clientX + 16)) + 'px';
    this.tooltip.style.top = Math.min(innerHeight - 44, event.clientY + 20) + 'px';
    pet.renderer.domElement.style.cursor = label ? 'pointer' : 'grab';
    if (!click) return false;
    this.tooltip.hidden = true;
    if (dog) { pet.command('pet'); return true; }
    if (command) { pet.command(command); return true; }
    if (bubble !== undefined) {
      this.props.pop(bubble); this.album.bubbles++; this.audio.tone(880 + bubble * 24, .12, .18);
      pet.toast('收集了一点彩虹 · 泡泡 ' + this.album.bubbles); this.refresh(); this.save(); return true;
    }
    if (treasure !== undefined) { this.seek(treasure); return true; }
    if (item) { this.visit(item.id); return true; }
    return false;
  }

  update(dt) {
    const pet = this.pet, position = pet.cat.root.position;
    let speed = 0, pose = 'idle', handled = false;
    if (this.transfer) {
      handled = true;
      const transfer = this.transfer, u = Math.min(1, (pet.time - transfer.start) / 1.65);
      // Anticipation, lift, translation above the front lip, then a soft landing.
      const travel = smooth(THREE.MathUtils.clamp((u - .24) / .61, 0, 1));
      position.lerpVectors(transfer.from, transfer.to, travel);
      const apex = Math.max(transfer.from.y, transfer.to.y) + .57;
      position.y = transfer.from.y + (apex - transfer.from.y) * smooth(THREE.MathUtils.clamp((u - .12) / .32, 0, 1)) - (apex - transfer.to.y) * smooth(THREE.MathUtils.clamp((u - .62) / .38, 0, 1));
      const direction = Math.atan2(transfer.to.x - transfer.from.x, transfer.to.z - transfer.from.z);
      const turn = Math.atan2(Math.sin(direction - transfer.angle), Math.cos(direction - transfer.angle));
      pet.cat.root.rotation.y = transfer.angle + turn * smooth(Math.min(1, u / .22));
      pose = u < .16 ? 'crouch' : u > .88 ? 'land' : 'jump';
      if (u >= 1) {
        position.copy(transfer.to); this.onBed = transfer.enter; this.transfer = null;
        pet.pathTarget = null;
        if (this.onBed) {
          pet.setState('sleep');
          this.award(this.items.find(item => item.id === 'bed'));
          if (this.queued) this.beginTransfer(false);
        } else {
          this.active = null; this.props.stop(); pet.setState('idle', 3);
          const next = this.queued; this.queued = null; if (next) next();
        }
      }
    } else if (this.onBed) {
      handled = true; pose = 'sleep';
      pet.stats.energy = Math.min(100, pet.stats.energy + dt * 1.1);
    } else if (pet.state === 'trick' && this.trick) {
      handled = true; pose = this.trick; speed = pet.moveTo(null, dt, 0);
      if (pet.time >= pet.stateUntil) {
        pet.stats.affection = Math.min(100, pet.stats.affection + 2);
        this.trick = null; pet.setState('idle', 3); pet.save();
      }
    } else if (pet.state === 'visit' && this.active) {
      handled = true;
      const item = this.active;
      speed = pet.moveTo(item.approach, dt, 1.25, item.focus);
      const desired = Math.atan2(item.focus.x - position.x, item.focus.z - position.z);
      const turn = Math.atan2(Math.sin(desired - pet.cat.root.rotation.y), Math.cos(desired - pet.cat.root.rotation.y));
      if (position.distanceTo(item.approach) < .17 && Math.abs(turn) < .14 && speed < .12) {
        if (item.id === 'bed') this.beginTransfer(true);
        else {
          pet.setState('interact', item.duration); this.started = pet.time; this.storyLine = -1; this.props.start(item.id, pet.time);
          pet.marker.visible = false; pet.toast(item.detail);
          if (item.id === 'lamp') pet.setLight(!pet.night);
        }
      } else if (pet.time - this.startedWalking > 45) {
        this.interrupt(() => pet.setState('idle', 3)); pet.toast('这边有些挤，换个位置再试试吧');
      }
    } else if (pet.state === 'interact' && this.active) {
      handled = true; pose = this.active.pose;
      speed = pet.moveTo(null, dt, 0);
      if (this.active.id === 'read') {
        const line = Math.min(2, Math.floor((pet.time - this.started) / 2.3));
        if (line !== this.storyLine) {
          this.storyLine = line;
          pet.toast(['从前，有颗小星星想找到一个家。', '它跟着小狗，走进亮着灯的小屋。', '小狗说：你来了，这里就更温暖啦。'][line]);
        }
      }
      if (pet.time >= pet.stateUntil) {
        const item = this.active;
        if (item.id === 'snack') pet.stats.energy = Math.min(100, pet.stats.energy + 18);
        this.award(item); this.props.stop(); this.active = null;
        if (item.id === 'fetch') pet.throwBall(); else pet.setState('idle', 3);
      }
    } else if (pet.state === 'treasure' && this.treasure !== null) {
      handled = true; speed = pet.moveTo(pet.target, dt, 1.45);
      if (position.distanceTo(pet.target) < .18) {
        this.props.tokens[this.treasure].visible = false; this.treasure = null;
        this.album.treasures++; pet.stats.affection = Math.min(100, pet.stats.affection + 4);
        const left = this.props.tokens.filter(token => token.visible).length;
        pet.marker.visible = false; pet.setState('celebrate', 2.5);
        pet.toast(left ? '找到星星啦 · 还藏着 ' + left + ' 颗' : '三颗星都找到了 · 你们是最佳搭档！');
        this.audio.tone(783.99, .6, .25); this.refresh(); this.save(); pet.save();
      }
    }
    this.progress.hidden = !handled;
    if (handled) {
      this.progress.querySelector('span').textContent = this.transfer ? (this.transfer.enter ? '跳上软软的窝' : '伸个懒腰，出发') : this.onBed ? '甜梦中 · 点休息或其他物品叫醒' : this.trick ? '只属于我们的默契' : pet.state === 'treasure' ? '正在寻找小星星' : pet.state === 'visit' ? '走向 · ' + this.active?.label : this.active?.label || '';
      this.progress.querySelector('i').style.width = (pet.state === 'interact' ? Math.min(100, (pet.time - this.started) / this.active.duration * 100) : 100) + '%';
    }
    this.audio.update(pet.night);
    return { handled, speed, pose };
  }

  refresh() {
    const count = this.album.visits.length;
    this.panel.querySelector('.cl-pet-collection').textContent = `小窝回忆 ${count} / ${this.items.length} · ${count === this.items.length ? '满满一屋子的幸福' : '每个角落，都有小惊喜'}`;
    this.panel.querySelector('.cl-pet-collection-bar span').style.width = count / this.items.length * 100 + '%';
    this.panel.querySelector('.cl-pet-album-score').textContent = `找到 ${this.album.treasures} 颗星星 · 收集 ${this.album.bubbles} 个泡泡 · 回忆自动保存`;
    for (const item of this.items) {
      const button = this.panel.querySelector(`[data-action="visit:${item.id}"]`);
      const complete = this.album.visits.includes(item.id);
      button.classList.toggle('is-collected', complete);
      button.querySelector('.cl-pet-stamp').textContent = complete ? '✓' : '○';
    }
    this.panel.querySelector('[data-action="next-treasure"]').hidden = !this.props.tokens.some(token => token.visible);
  }

  save() { try { localStorage.setItem('cl-pet-album-v1', JSON.stringify(this.album)); } catch (_) { /* Optional. */ } }
  close() {
    this.closePanel(); this.audio.setActive(false); this.save(); this.props.clear();
    this.active = this.transfer = this.treasure = this.queued = this.trick = null; this.onBed = false;
    this.progress.hidden = true;
  }
}
