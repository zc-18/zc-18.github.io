/**
 * claude-motion.js — GSAP 全站动画层
 * 依赖（inject.bottom 中按序 defer 加载）：/js/lib/gsap.min.js →
 * ScrollTrigger.min.js → SplitText.min.js → 本文件。
 *
 * 设计纪律：
 *  - 只动 transform / opacity(autoAlpha)；指针跟随一律 quickTo；列表显现一律
 *    ScrollTrigger.batch；scrub 类一律 ease:'none'。
 *  - 防闪烁：<head> 内联 gate 已给 <html> 加 cl-motion（claude-motion.css 据此
 *    预藏入场元素）；本文件任何失败走 bail() 摘类，降级回主题原生 CSS 入场。
 *  - pjax：本文件在 #body-wrap 外只执行一次。每页动画装进一个 gsap.matchMedia()
 *    上下文；pjax:send 时 mm.kill()（不 revert——revert 会把旧页内容瞬间打回
 *    预藏态，换页等待期一片空白），pjax:complete 时对新 DOM 重建。
 *    defer 脚本的监听注册晚于主题 pjax 引导，故 init 天然排在主题 refreshFn
 *    与预加载遮罩揭开之后（这也是不用 btf.addGlobalFn 的原因——那会插到
 *    refreshFn 之前）。
 *  - 首屏入场与滚动显现都在「预加载遮罩揭开」后才创建（onceRevealed），
 *    异步时机创建的动画必须经 ctx.add 收进 matchMedia 上下文才能被 teardown
 *    kill 到；scrub 类（进度条/视差/竖线）无首帧观感问题，同步创建。
 *  - 断点穿越（拖窗跨 768px）会让 mm 重跑 handler：played 守卫直接把入场
 *    元素一次性显形，只重建 scrub 类，避免页面中途回到预藏态。
 */
(() => {
  'use strict';

  const root = document.documentElement;
  window.__clMotion = true; // gate 看门狗握手：本文件已执行，后续失败由 bail 摘类收尾
  if (!root.classList.contains('cl-motion')) return; // reduce / noscript / 看门狗已摘：gate 未开

  /* ---------- 状态（全部先于 bail 声明，避免 TDZ） ---------- */
  let mm = null;          // 当页 gsap.matchMedia 上下文
  let initSeq = 0;        // 初始化序号：作废跨页残留的异步回调（预加载揭幕等）
  let played = false;     // 当页入场是否已播（断点穿越守卫）
  let watchdog = null;    // mm 条件全不命中的兜底计时器
  let dead = false;       // bail 后彻底停机
  let heroX = null, heroY = null;    // hero 鼠标视差 quickTo 对（每页在 mm 内重建）
  let magX = null, magY = null;      // 磁吸 quickTo 对（boot 建一次，跨页存活）
  let ballWrap = null;
  let breath = null;                 // 悬浮球呼吸 tween（跨页存活）
  let splits = [];                   // 当页 SplitText 实例（teardown 需显式 revert）
  let tiltOn = false;                // 首页卡片 3D 倾斜开关（buildScrubs 按页重算）
  let tiltCard = null;               // 当前倾斜中的卡片
  const tiltMap = new WeakMap();     // 卡片 → { rx, ry } quickTo 对

  /* SplitText 没有 .kill 方法，mm.kill()（非 revert 路径）清不掉它——其
     autoSplit 的 ResizeObserver 和 document.fonts 监听会随 pjax 换页累积。
     revert 只是 unsplit（还原原始文本），不影响旧页可见性，换页时可安全调。 */
  const revertSplits = () => {
    splits.forEach((s) => { try { s.revert(); } catch (e) { /* 忽略 */ } });
    splits = [];
  };

  /* 统一降级出口：摘类让 claude-motion.css 整体失活，主题原生入场回归 */
  const bail = () => {
    if (dead) return;
    dead = true;
    root.classList.remove('cl-motion');
    clearTimeout(watchdog);
    try { mm && mm.revert(); } catch (e) { /* 忽略 */ }
    mm = null;
    revertSplits();
    try {
      if (breath) breath.kill();
      const bar = document.getElementById('cl-progress');
      if (bar) bar.classList.add('cl-progress--hidden');
      if (ballWrap && window.gsap) gsap.set(ballWrap, { clearProps: 'transform' });
    } catch (e) { /* 忽略 */ }
  };

  if (!window.gsap || !window.ScrollTrigger || !window.SplitText) return bail();
  try {
    gsap.registerPlugin(ScrollTrigger, SplitText);
  } catch (e) { return bail(); }

  gsap.defaults({ ease: 'power3.out', duration: 0.6 });
  ScrollTrigger.config({ ignoreMobileResize: true }); // 防移动端地址栏伸缩 refresh 风暴

  /* ---------- 常量 ---------- */
  // heroMouse 已按用户要求关闭（2026-07-22）：悬停大屏时 #site-info 被 quickTo
  // 平移 ±12/±8px，进入瞬间的缓动观感是"跳一下"。代码保留，置 true 可回开。
  const FEATURES = { tilt: true, magnet: true, counter: true, heroMouse: false };
  const BP = {
    desktop: '(min-width: 769px)',
    mobile: '(max-width: 768.98px)', // .98：与 desktop 互补，任何宽度必命中其一
    reduce: '(prefers-reduced-motion: reduce)',
  };
  const FINE = matchMedia('(hover: hover) and (pointer: fine)');
  const MQ_DESKTOP = matchMedia(BP.desktop);
  /* 与 claude-motion.css 第 1 块预藏集合同步维护（外加几个 JS 才藏的目标） */
  const REVEAL_UNION =
    '#site-info,#scroll-down,#post-info,#article-container,#pagination,' +
    '.recent-post-item,.post-copyright,.tag_share,.pagination-post,' +
    '.claude-page-head-overline,.claude-page-head-stats,.claude-page-head-divider,' +
    '.claude-tag-chip,.claude-fold,.claude-tl-year-head,.claude-tl-item,' +
    '.article-sort-item,#aside-content .card-widget,.claude-footer';

  /* ---------- 工具 ---------- */
  const q = (s) => document.querySelector(s);
  const qa = (s) => gsap.utils.toArray(s);

  const debounce = (fn, ms) => {
    let t;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  };

  /**
   * 预加载遮罩揭开后执行 cb。已揭开时必须同步调——pjax 场景 init 已晚于主题
   * 揭幕，同一任务内建好入场才不会漏出一帧未动画的内容。
   * gear 遮罩：硬加载 max(load,1s) 揭开、3s 强制兜底 → 4s 计时器必然兜住。
   */
  const onceRevealed = (cb) => {
    const box = document.getElementById('loading-box');
    if (!box || box.classList.contains('loaded')) { cb(); return; }
    let done = false;
    const ob = new MutationObserver(() => {
      if (box.classList.contains('loaded')) fire();
    });
    const fire = () => { if (!done) { done = true; ob.disconnect(); cb(); } };
    ob.observe(box, { attributes: true, attributeFilter: ['class'] });
    setTimeout(fire, 4000);
  };

  /* 把元素文本里的每段数字包成 span 并生成 0→N 滚动 tween（加入时间线用） */
  const countUp = (el) => {
    const tweens = [];
    if (!el || !FEATURES.counter) return tweens;
    [...el.childNodes].forEach((node) => {
      if (node.nodeType !== 3 || !/\d/.test(node.nodeValue)) return;
      const frag = document.createDocumentFragment();
      node.nodeValue.split(/(\d+)/).forEach((part) => {
        if (/^\d+$/.test(part)) {
          const sp = document.createElement('span');
          const n = +part;
          sp.textContent = '0';
          frag.appendChild(sp);
          const o = { v: 0 };
          tweens.push(gsap.to(o, {
            v: n, duration: 0.9, ease: 'power1.out', snap: { v: 1 },
            onUpdate: () => { sp.textContent = o.v; },
          }));
        } else if (part) {
          frag.appendChild(document.createTextNode(part));
        }
      });
      el.replaceChild(frag, node);
    });
    return tweens;
  };

  /* ---------- 指针交互（单一 mousemove 委托：tilt / hero 视差 / 磁吸共用） ---------- */
  /* tilt 曾因 .cardHover 的 transition:all 与 GSAP transform 叠加缓动被移除；
     该过渡已收窄为 box-shadow-only（function.styl），复活安全。角度须保持小：
     rotationY 投影过大会撑出横向滚动条（当年的第二个坑）。 */
  const TILT_MAX = 3; // 度
  /* 回正必须废弃 quickTo 对:elastic 回正 tween 的 overwrite:'auto' 会把
     quickTo 内部 tween 的 rotation 通道永久杀死,之后 resetTo 只会刷
     "not eligible for reset" 警告、倾斜静默失效(历史版本就带着这个 bug)。
     一句 killTweensOf 连 quickTo 内部 tween 一起清,下次悬停经 tiltPair
     重建——卡片 inline perspective 还在,层是暖的,重建只是两个廉价补间。 */
  const tiltReset = (card) => {
    if (!card) return;
    gsap.killTweensOf(card, 'rotationX,rotationY');
    tiltMap.delete(card);
    gsap.to(card, {
      rotationX: 0, rotationY: 0, duration: 0.8,
      ease: 'elastic.out(1, 0.5)', overwrite: 'auto',
    });
  };

  /* 取/建某卡的 quickTo 对(warm 与 onMove 懒建共用,参数只此一份) */
  const tiltPair = (card) => {
    let pair = tiltMap.get(card);
    if (!pair) {
      gsap.killTweensOf(card, 'rotationX,rotationY'); // 掐掉在途回正弹簧,防悬停中被拉回 0
      gsap.set(card, { transformPerspective: 900, force3D: true });
      pair = {
        rx: gsap.quickTo(card, 'rotationX', { duration: 0.4, ease: 'power2.out' }),
        ry: gsap.quickTo(card, 'rotationY', { duration: 0.4, ease: 'power2.out' }),
      };
      tiltMap.set(card, pair);
    }
    return pair;
  };

  /* 首悬预热:提前建 3D 层与 quickTo 对,首次悬停只剩纯角度补间。不预热的话
     第一帧要同时做 层提升+perspective 突变+建补间,观感抖一下。入场 tween 的
     clearProps:'transform' 会连 perspective 一起清,所以只能在入场完成后调
     (batchIn onComplete / 断点穿越 showAll 之后),不能在 buildScrubs 里提前。
     必须"总是重建"而非 has() 跳过:clearProps 与断点穿越的 mm revert 都会在
     不清 tiltMap 的情况下摧毁 3D 层/杀死 quickTo 通道,旧缓存是死的。 */
  const tiltWarm = (cards) => {
    if (!tiltOn) return;
    (cards || []).forEach((card) => {
      gsap.killTweensOf(card, 'rotationX,rotationY');
      tiltMap.delete(card);
      tiltPair(card);
    });
  };

  const onMove = (e) => {
    if (dead || !FINE.matches || !MQ_DESKTOP.matches) return;

    // 1) 首页卡片 3D 倾斜
    if (tiltOn) {
      const card = e.target.closest ? e.target.closest('.recent-post-item') : null;
      if (card !== tiltCard) { tiltReset(tiltCard); tiltCard = card; }
      if (card) {
        const pair = tiltPair(card);
        const r = card.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;  // -0.5 ~ 0.5
        const ny = (e.clientY - r.top) / r.height - 0.5;
        pair.ry(nx * 2 * TILT_MAX);
        pair.rx(-ny * 2 * TILT_MAX);
      }
    }

    // 2) 首页 hero 鼠标视差（轻偏移；与滚动视差的 yPercent 分量互不干扰）
    if (heroX) {
      const inHero = e.target.closest && e.target.closest('#page-header.full_page');
      const nx = (e.clientX / innerWidth - 0.5) * 2;
      const ny = (e.clientY / innerHeight - 0.5) * 2;
      heroX(inHero ? nx * 12 : 0);
      heroY(inHero ? ny * 8 : 0);
    }

    // 3) AI 悬浮球磁吸（近距按距离衰减吸附，≤8px）
    if (magX && ballWrap) {
      const r = ballWrap.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      const R = 140;
      if (dist < R) {
        const pull = 1 - dist / R;
        magX(gsap.utils.clamp(-8, 8, dx * pull * 0.25));
        magY(gsap.utils.clamp(-8, 8, dy * pull * 0.25));
      } else {
        magX(0); magY(0);
      }
    }
  };

  const onLeaveDoc = () => {
    tiltReset(tiltCard); tiltCard = null;
    if (heroX) { heroX(0); heroY(0); }
    if (magX) { magX(0); magY(0); }
  };

  /* ---------- 持久件（boot 一次，跨 pjax 存活） ---------- */

  // 阅读进度条节点：挂 body（#body-wrap 外，pjax 不换）；tween 每页在 mm 内重建
  const bar = document.createElement('div');
  bar.id = 'cl-progress';
  bar.className = 'cl-progress--hidden';
  document.body.appendChild(bar);

  // 懒加载真图撑高文章 → 触发位置漂移：捕获段委托 img load，去抖后 refresh
  const lazyRefresh = debounce(() => ScrollTrigger.refresh(), 200);
  document.addEventListener('load', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.closest && t.closest('#article-container')) lazyRefresh();
  }, true);
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
  }

  document.addEventListener('mousemove', onMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeaveDoc);

  /* AI 悬浮球：包一层 wrapper，呼吸 + 磁吸全动 wrapper（球本体的 ai-float
     关键帧与 :hover 过渡保持原样，GSAP 直接写球的 transform 会被关键帧吞掉
     且永久压死 hover）。ai-assistant.js 的 defer 序在前，此时球已构建。 */
  const setupBall = () => {
    if (!FEATURES.magnet || dead) return;
    const ball = document.getElementById('ai-launcher');
    if (!ball || document.getElementById('cl-ball-wrap')) return;
    ballWrap = document.createElement('div');
    ballWrap.id = 'cl-ball-wrap';
    ball.parentNode.insertBefore(ballWrap, ball);
    ballWrap.appendChild(ball);
    magX = gsap.quickTo(ballWrap, 'x', { duration: 0.35, ease: 'power2.out' });
    magY = gsap.quickTo(ballWrap, 'y', { duration: 0.35, ease: 'power2.out' });
    breath = gsap.to(ballWrap, {
      scale: 1.045, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1,
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupBall);
  } else {
    setupBall();
  }

  /* ---------- 页面模块 ---------- */

  /** 断点穿越守卫：入场已播过 → 全部一次性显形，只让 scrub 类重建 */
  const showAll = () => {
    const els = qa(REVEAL_UNION);
    if (els.length) gsap.set(els, { autoAlpha: 1, x: 0, y: 0, yPercent: 0, scale: 1 });
  };

  /** scrub / 指针类（无首帧观感问题，init 时同步创建；断点变化时重建） */
  const buildScrubs = (page, desktop) => {
    // 阅读进度条：仅文章页且正文足够长
    const article = q('#article-container');
    if (page.post && article && article.offsetHeight > innerHeight * 1.2) {
      bar.classList.remove('cl-progress--hidden');
      gsap.fromTo(bar, { scaleX: 0 }, {
        scaleX: 1, ease: 'none',
        scrollTrigger: {
          trigger: article, start: 'top top', end: 'bottom bottom', scrub: true,
        },
      });
    } else {
      bar.classList.add('cl-progress--hidden');
    }

    if (page.home && desktop) {
      // hero 滚出视差（fromTo 双端显式：#site-info 被预藏 CSS 命中，
      // to() 的起值捕获会读到 visibility:hidden 的瞬态，必须显式给起点）
      gsap.fromTo('#site-info', { yPercent: 0, autoAlpha: 1 }, {
        yPercent: 30, autoAlpha: 0, ease: 'none',
        scrollTrigger: {
          trigger: '#page-header.full_page', start: 'top top', end: 'bottom top', scrub: true,
        },
      });
      if (q('#scroll-down')) {
        gsap.fromTo('#scroll-down', { autoAlpha: 1 }, {
          autoAlpha: 0, ease: 'none',
          scrollTrigger: {
            trigger: '#page-header.full_page', start: 'top top', end: '20% top', scrub: true,
          },
        });
      }
      // hero 鼠标视差 quickTo 对
      if (FEATURES.heroMouse && FINE.matches && q('#site-info')) {
        heroX = gsap.quickTo('#site-info', 'x', { duration: 0.6, ease: 'power3.out' });
        heroY = gsap.quickTo('#site-info', 'y', { duration: 0.6, ease: 'power3.out' });
      }
    }

    // 归档时间轴竖线随滚生长（CSS 变量挂元素，伪元素消费）
    if (page.archive && q('.claude-timeline')) {
      gsap.fromTo('.claude-timeline', { '--tl-grow': 0 }, {
        '--tl-grow': 1, ease: 'none',
        scrollTrigger: {
          trigger: '.claude-timeline', start: 'top 80%', end: 'bottom 60%', scrub: true,
        },
      });
    }

    // 首页卡片 tilt 开关（断点穿越重跑 buildScrubs 时同步重算）;
    // 关断瞬间若有卡片正倾斜着,必须回正——桌面→移动穿越可以不经过
    // mouseleave(分屏快捷键/DevTools 停靠),否则卡片歪着冻结在移动版式
    tiltOn = !!(page.home && desktop && FEATURES.tilt && FINE.matches);
    if (!tiltOn && tiltCard) { tiltReset(tiltCard); tiltCard = null; }
  };

  /** 滚动显现类（batch：预态 set + once 触发；首屏内元素创建即触发） */
  const buildBatches = (page, desktop) => {
    const batchIn = (targets, preset, vars, start) => {
      const els = qa(targets);
      if (!els.length) return;
      gsap.set(els, preset);
      ScrollTrigger.batch(els, {
        start: start || 'top 88%',
        once: true,
        interval: 0.08,
        onEnter: (b) => gsap.to(b, vars),
      });
    };

    if (page.home) {
      // 入场不再带 scale，且完成后清掉 inline transform——残留的 transform
      // 会与 .cardHover 的 transition:all 在悬停时互相缓动，观感像卡片收缩。
      // clearProps 之后立刻 tiltWarm：预热 3D 层，首次悬停不抖（见 tiltWarm 注释）
      batchIn('.recent-post-item',
        desktop ? { y: 40, autoAlpha: 0 } : { y: 24, autoAlpha: 0 },
        desktop
          ? { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.09, ease: 'power3.out', clearProps: 'transform',
              onComplete: function () { tiltWarm(this.targets()); } }
          : { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.06, ease: 'power3.out', clearProps: 'transform' });
      const pg = q('#pagination');
      if (pg) {
        gsap.set(pg, { y: 24, autoAlpha: 0 });
        ScrollTrigger.create({
          trigger: pg, start: 'top 96%', once: true,
          onEnter: () => gsap.to(pg, { y: 0, autoAlpha: 1, duration: 0.6 }),
        });
      }
    }

    if (page.post) {
      batchIn('.post-copyright, .tag_share, .pagination-post',
        { y: 24, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.1 }, 'top 92%');
    }

    if (page.archive) {
      batchIn('.claude-tl-year-head',
        { x: -16, autoAlpha: 0 },
        { x: 0, autoAlpha: 1, duration: 0.55, ease: 'power2.out' }, 'top 90%');
      batchIn('.claude-tl-item',
        { y: 18, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.5, stagger: desktop ? 0.05 : 0.04 }, 'top 92%');
    }

    if (page.sort) {
      batchIn('.article-sort-item',
        { y: 26, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.55, stagger: 0.07 }, 'top 90%');
    }

    // 标签页 chips 数量多时走 batch（少时并入页头时间线，见 buildEntrance）
    if (page.tags && qa('.claude-tag-chip').length > 36) {
      batchIn('.claude-tag-chip',
        { scale: 0.85, y: 14, autoAlpha: 0 },
        {
          scale: 1, y: 0, autoAlpha: 1, duration: 0.5,
          stagger: desktop ? 0.02 : 0.015, ease: 'back.out(1.6)',
        }, 'top 92%');
    }

    // 侧栏卡片（有 aside 的页面通用，含 about）
    batchIn('#aside-content .card-widget',
      desktop ? { x: 24, autoAlpha: 0 } : { y: 24, autoAlpha: 0 },
      desktop
        ? { x: 0, autoAlpha: 1, duration: 0.6, stagger: 0.1 }
        : { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.1 }, 'top 92%');

    // 页脚（全页面，含 about）
    const foot = q('.claude-footer');
    if (foot) {
      gsap.set(foot, { y: 26, autoAlpha: 0 });
      ScrollTrigger.create({
        trigger: foot, start: 'top 96%', once: true,
        onEnter: () => gsap.to(foot, { y: 0, autoAlpha: 1, duration: 0.6 }),
      });
    }
  };

  /** 首屏入场时间线（在揭幕回调内同步调用）。
      一律 set→to 双段式（终值显式）：站内多处 hover 用 `transition: all`，
      from() 的「终值=捕获当前计算值」会读到瞬态值导致 0→0 永久隐形
      （/tags/ chips 实测踩坑）；to() 终值写死则任何捕获异常都只影响起点。 */
  const buildEntrance = (page, desktop) => {
    // —— 首页 hero ——
    if (page.home) {
      const info = q('#site-info');
      if (info) gsap.set(info, { autoAlpha: 1 });
      const title = q('#site-title');
      if (title && desktop) {
        // SplitText 的 mask 切片是 GSAP 自建节点，无 transition 干扰，from 安全
        splits.push(SplitText.create(title, {
          type: 'chars', mask: 'chars', aria: 'auto', autoSplit: true,
          onSplit: (self) => gsap.from(self.chars, {
            yPercent: 110, duration: 0.65, ease: 'power4.out', stagger: 0.04,
          }),
        }));
      } else if (title) {
        gsap.set(title, { y: 24, autoAlpha: 0 });
        gsap.to(title, { y: 0, autoAlpha: 1, duration: 0.6 });
      }
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      const dly = desktop ? 0 : 0.15;
      if (q('#site-subtitle')) {
        gsap.set('#site-subtitle', { y: 18, autoAlpha: 0 });
        tl.to('#site-subtitle', { y: 0, autoAlpha: 1, duration: 0.55 }, 0.35 + dly);
      }
      if (q('#site_social_icons')) {
        gsap.set('#site_social_icons', { y: 14, autoAlpha: 0 });
        tl.to('#site_social_icons', { y: 0, autoAlpha: 1, duration: 0.5 }, 0.5 + dly);
      }
      if (q('#scroll-down')) {
        gsap.set('#scroll-down', { autoAlpha: 0 });
        tl.to('#scroll-down', { autoAlpha: 1, duration: 0.6 }, 0.85 + dly);
      }
    }

    // —— 文章页头部 + 正文 ——
    if (page.post) {
      const postInfo = q('#post-info');
      if (postInfo) {
        gsap.set(postInfo, { autoAlpha: 1 });
        const pt = postInfo.querySelector('.post-title');
        if (pt && desktop) {
          splits.push(SplitText.create(pt, {
            type: 'lines', mask: 'lines', autoSplit: true,
            onSplit: (self) => gsap.from(self.lines, {
              yPercent: 105, duration: 0.7, ease: 'power3.out', stagger: 0.08,
            }),
          }));
          const metas = qa('#post-info .meta-firstline, #post-info .meta-secondline');
          if (metas.length) {
            gsap.set(metas, { y: 14, autoAlpha: 0 });
            gsap.to(metas, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.12, delay: 0.25 });
          }
        } else {
          gsap.set(postInfo, { y: 20, autoAlpha: 0 });
          gsap.to(postInfo, { y: 0, autoAlpha: 1, duration: 0.55 });
        }
      }
      if (q('#article-container')) {
        gsap.set('#article-container', { y: desktop ? 28 : 20, autoAlpha: 0 });
        gsap.to('#article-container', {
          y: 0, autoAlpha: 1, duration: 0.65,
          ease: 'power2.out', delay: desktop ? 0.15 : 0.1,
        });
      }
    }

    // —— 列表页头签名（tags / categories / archives 及 tag·category 落地页共用）——
    // 落地页（article-sort 布局）只命中 page.sort，漏掉它会让预藏的
    // overline / stats / divider 永远不被揭示（claude-motion.css 第 1 块）。
    if (page.tags || page.cats || page.archive || page.sort) {
      const overline = q('.claude-page-head-overline');
      const stats = q('.claude-page-head-stats');
      const divider = q('.claude-page-head-divider');
      const tl = gsap.timeline();
      if (overline) {
        gsap.set(overline, { y: -14, autoAlpha: 0 });
        tl.to(overline, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'power2.out' });
      }
      if (stats) {
        gsap.set(stats, { y: 16, autoAlpha: 0 });
        tl.to(stats, { y: 0, autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, '-=.2');
        countUp(stats).forEach((c) => tl.add(c, '<'));
      }
      if (divider) {
        gsap.set(divider, { scaleX: 0, transformOrigin: 'left center', autoAlpha: 1 });
        tl.to(divider, { scaleX: 1, duration: 0.6, ease: 'power2.inOut' }, '-=.25');
      }
      // 标签 chips（≤36 个直接接在签名后弹出）
      if (page.tags) {
        const chips = qa('.claude-tag-chip');
        if (chips.length && chips.length <= 36) {
          gsap.set(chips, { scale: 0.85, y: 14, autoAlpha: 0 });
          tl.to(chips, {
            scale: 1, y: 0, autoAlpha: 1, duration: 0.5,
            ease: 'back.out(1.6)', stagger: desktop ? 0.02 : 0.015,
          }, '-=.3');
        }
      }
      // 分类手风琴卡（只动 section 容器，不碰 grid-rows 展开机制）
      if (page.cats) {
        const folds = qa('.claude-fold');
        if (folds.length) {
          gsap.set(folds, { y: 26, autoAlpha: 0 });
          tl.to(folds, {
            y: 0, autoAlpha: 1, duration: 0.55, stagger: desktop ? 0.07 : 0.05,
          }, '-=.25');
        }
      }
    }
  };

  /* ---------- init / teardown ---------- */
  const init = () => {
    if (dead) return;
    try {
      if (mm) { mm.kill(); mm = null; revertSplits(); } // 幂等保护
      initSeq++;
      played = false;
      const page = {
        home: !!q('#page-header.full_page'),
        post: !!q('#body-wrap.post #article-container'),
        tags: !!q('.claude-tags-grid'),
        cats: !!q('.claude-cat-accordion'),
        archive: !!q('.claude-timeline'),
        sort: !!q('.article-sort-item'),
      };
      let hit = false;
      mm = gsap.matchMedia();
      mm.add(
        { isDesktop: BP.desktop, isMobile: BP.mobile, reduce: BP.reduce },
        (ctx) => {
          try {
            hit = true;
            if (ctx.conditions.reduce) { bail(); return; }
            const desktop = ctx.conditions.isDesktop;
            buildScrubs(page, desktop);
            if (played) { showAll(); tiltWarm(qa('.recent-post-item')); return; } // 穿越路径不走入场,预热在此补
            const seq = initSeq;
            onceRevealed(() => {
              if (seq !== initSeq || dead) return; // 已换页/已停机：作废
              ctx.add(() => {
                try {
                  buildBatches(page, desktop);
                  buildEntrance(page, desktop);
                  played = true;
                } catch (e) { bail(); } // 揭幕回调异步于 init 的 try，抛错必须自兜
              });
            });
          } catch (e) { bail(); } // 断点穿越重跑时同样异步于 init 的 try
        }
      );
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { if (!hit) bail(); }, 3000);
    } catch (e) { bail(); }
  };

  const teardown = () => {
    if (dead) return;
    initSeq++; // 作废未触发的 onceRevealed 回调
    clearTimeout(watchdog);
    if (mm) { mm.kill(); mm = null; } // kill 不 revert：旧页在换页等待期保持可见
    revertSplits(); // SplitText 例外：unsplit 不影响旧页观感，不收则观察器泄漏
    heroX = heroY = null;
    tiltOn = false;
    tiltCard = null;
    bar.classList.add('cl-progress--hidden');
    gsap.set(bar, { scaleX: 0 });
  };

  /* ---------- 生命周期 ---------- */
  document.addEventListener('pjax:send', teardown);
  document.addEventListener('pjax:complete', init);
  init(); // 硬加载：defer 阶段 DOM 已完整
})();
