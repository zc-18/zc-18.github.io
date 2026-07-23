/**
 * claude-aside.js — 两列布局「短列」方向感知吸附（谁短管谁）
 *
 * 行为：对较短的那一列做方向感知吸附——向下滚动时跟随长列一起滚，直到自身
 * 底边贴到视口底(-20px)固定；向上滚动时反向跟随，直到顶边贴到视口顶（导航
 * 可见时 70px，否则 20px）固定；矮于视口的列退化为普通吸顶。
 *
 * 目标选择（pickTarget）：post/长内容页侧栏短 → 管 #aside-content >
 * .sticky_layout（原有行为不变）；标签/分类/归档下钻页主列短、侧栏最高 →
 * 管主列 #tag/#category/#archive（sticky 基座在 claude-pages.css §7）。
 * 判据利用 #aside-content 默认 stretch：其 offsetHeight 恒等于 flex 行高
 * = max(两列高)，故 mainH + 1 < asideH ⟺ 侧栏更高 ⟺ 管主列；两列等高或
 * 主列更高时管 sticky_layout，行程为 0 时天然退化 1:1 粘连滚动。
 * （曾有 pane 视口内滚面板：差速内滚割裂、下部卡片够不到，2026-07-22 已按
 * 用户决定删除，勿复活——本对称吸附无差速、无内滚，页面仍由长列撑高，
 * 全部卡片 1:1 真实可达。）
 *
 * 实现：保留 CSS 的 position:sticky 作降级基座（aside 基座在 stylus——
 * aside.styl 与 theme.styl 影子副本共两份；主列基座在 claude-pages.css §7，
 * 均被 inline 样式压过），逐滚动帧记账式改写 inline top：
 * newTop = clamp(oldTop - dy, vh - H - GAP_BOTTOM, gapTop)。clamp 天然处理
 * 双向跟随与锚点大跳；sticky 的 containing block 钳制保证短列不会滑出自己
 * 的列压到 footer。本脚本失效/未加载时无 inline 样式残留，自动回落原生
 * sticky 吸顶。不变式：任意时刻至多一个节点带本脚本的 inline 样式。
 *
 * 生命周期：脚本经 inject.bottom 注入，位于 pjax 容器 #body-wrap 之外，
 * 全局监听只挂一次；.sticky_layout 与 #page-header 都在容器内，随
 * pjax:send/complete 摘挂（与 claude-motion.js 同款 document 级监听）。
 */
(() => {
  'use strict';

  /* .02 与 stylus maxWidth900()(max-width:900px,含 900)互补:恰好 900px 宽时
     布局已折叠单列,若本脚本仍激活会把主列钉住压在堆叠的 aside 上(同
     claude-motion.js 断点 .98 手法);claude-pages.css §7 基座同步此断点 */
  const MQ = matchMedia('(min-width: 900.02px)');
  const GAP_BOTTOM = 20;
  /* 主列候选:只点名三个列表下钻页(通用 div:first-child 会波及 post/about 等) */
  const MAIN_SEL = '#content-inner > #tag, #content-inner > #category, #content-inner > #archive';

  let el = null;          // 当前被管理的短列（.sticky_layout 或主列）
  let asideEl = null;     // #aside-content（stretch:offsetHeight 即 flex 行高）
  let mainEl = null;      // 当页主列候选（仅 tag/category/archive 下钻页非空）
  let ro = null;          // ResizeObserver：TOC 随读展开/懒图/hide-aside 改高
  let mo = null;          // MutationObserver：#page-header 类变化（nav-visible）
  let H = 0;              // 侧栏高
  let vh = 0;             // 视口高
  let top = 20;           // 记账中的 inline top 值
  let lastY = 0;
  let ticking = false;    // rAF 合帧标志
  let smoothTimer = null; // 临时平滑过渡的还原计时器

  const header = () => document.getElementById('page-header');

  /* 镜像 head.styl：nav 可见(或 fixed，本站 nav.fixed=false 恒缺席)时让位 70px */
  const gapTop = () => {
    const h = header();
    return h && (h.classList.contains('nav-visible') || h.classList.contains('fixed')) ? 70 : 20;
  };

  const measure = () => {
    vh = window.innerHeight;
    H = el ? el.offsetHeight : 0;   // hide-aside 折叠(display:none)时为 0
  };

  const isShort = (gt) => H + gt + GAP_BOTTOM <= vh;

  /* 摘掉本脚本写过的 inline 样式，节点回落各自的 CSS sticky 基座 */
  const clearInline = (n) => {
    if (!n) return;
    n.style.removeProperty('top');
    n.style.removeProperty('transition');
  };

  /* 谁短管谁:asideEl 因 stretch 恒等于行高 = max(两列高)。带 40px 迟滞——
     两列高度在临界点随懒图/字体重排 ±1px 抖动时,无迟滞会目标振荡、页面反复跳 */
  const FLIP_HYST = 40;
  const pickTarget = () => {
    if (!asideEl) return null;      // aside:false / 落地页:静默退出
    const sticky = asideEl.querySelector(':scope > .sticky_layout');
    if (!sticky) return null;
    if (!mainEl) return sticky;
    const diff = asideEl.offsetHeight - mainEl.offsetHeight; // >0 ⟺ 侧栏更高
    if (el === mainEl) return diff > -FLIP_HYST ? mainEl : sticky;
    return diff > FLIP_HYST ? mainEl : sticky;
  };

  /* 重选目标;返回是否切换。旧目标清 inline,保持"至多一个节点带 inline" */
  const retarget = () => {
    const next = pickTarget();
    if (next === el) return false;
    killSmooth();
    clearInline(el);
    el = next;
    return true;
  };

  const killSmooth = () => {
    if (smoothTimer) { clearTimeout(smoothTimer); smoothTimer = null; }
    if (el) el.style.transition = 'none';
  };

  /* 用当前记账值重新夹取并写入（不整体重置——TOC 随读展开时重置会跳） */
  const clampWrite = (smooth) => {
    if (!el) return;
    const gt = gapTop();
    top = isShort(gt) ? gt : Math.min(gt, Math.max(vh - H - GAP_BOTTOM, top));
    if (smooth) {
      if (smoothTimer) clearTimeout(smoothTimer);
      el.style.transition = 'top .4s ease';
      smoothTimer = setTimeout(() => { smoothTimer = null; if (el) el.style.transition = 'none'; }, 450);
    }
    el.style.top = top + 'px';
  };

  const onScroll = () => {
    if (!el || !MQ.matches || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!el || !MQ.matches) return;
      killSmooth();                 // 平滑归位窗口内用户又开始滚：滚动优先
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      const gt = gapTop();
      top = isShort(gt) ? gt : Math.min(gt, Math.max(vh - H - GAP_BOTTOM, top - dy));
      el.style.top = top + 'px';
    });
  };

  const activate = () => {
    if (!el) return;
    el.style.transition = 'none';   // 压掉基座过渡(stylus top .3s / §7 top .3s / common.styl all .3s)
    measure();
    // el 是 pickTarget 选出的短列:长列 1:1 滚动天然可达全部内容,短列走方向
    // 感知吸附,矮于视口时 isShort 退化吸顶。曾有「视口内滚面板(pane)」在此
    // 按 room<40 分叉——差速内滚与面板外的作者卡脱节、页面滚不动时下部卡片
    // 永远到不了(展示不全),2026-07-22 按用户决定整体删除,勿复活(现对称
    // 吸附无差速、无内滚,页面仍由长列撑高)。
    top = gapTop();
    lastY = window.scrollY;         // 防 pjax 恢复滚动位后首帧巨值 dy
    el.style.top = top + 'px';
  };

  /* <900px:还原原生 sticky（断点内 CSS 基座规则接管） */
  const deactivate = () => {
    if (!el) return;
    killSmooth();
    clearInline(el);
  };

  const teardown = () => {
    if (ro) { ro.disconnect(); ro = null; }
    if (mo) { mo.disconnect(); mo = null; }
    if (smoothTimer) { clearTimeout(smoothTimer); smoothTimer = null; }
    el = null;
    asideEl = null;
    mainEl = null;
  };

  const init = () => {
    teardown();
    asideEl = document.getElementById('aside-content');
    mainEl = document.querySelector(MAIN_SEL);
    el = pickTarget();
    if (!el) return;                // aside:false / hide-aside 落地页：静默退出

    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => {
        if (!el || !MQ.matches) return;
        if (retarget()) {           // 懒图/展开改高 →"谁短"翻转 → 换目标重置基线
          if (el) activate();
          return;
        }
        measure();
        clampWrite(false);
      });
      /* 观察面三节点全覆盖:asideEl 是 stretch 行高(长列变化经此反映);
         mainEl 与 sticky_layout 是两列各自的自然高(懒图/分页/TOC 随读展开) */
      ro.observe(asideEl);
      if (mainEl) ro.observe(mainEl);
      const st = asideEl.querySelector(':scope > .sticky_layout');
      if (st) ro.observe(st);
    }

    const h = header();             // nav-visible 由 300ms throttle 切换，可能晚于停滚
    if (h && 'MutationObserver' in window) {
      mo = new MutationObserver(() => {
        if (el && MQ.matches) { measure(); clampWrite(true); }
      });
      mo.observe(h, { attributes: true, attributeFilter: ['class'] });
    }

    if (MQ.matches) activate();
    else deactivate();
  };

  /* ---------- 一次性全局监听 ---------- */
  window.addEventListener('scroll', onScroll, { passive: true });

  /* 断点/视口变化统一走去抖 sync:resize 事件、MQL change、以及 rAF/RO/MO
     各异步回调之间的派发顺序并不稳定,逐事件分支处理会踩到 MQ.matches 的
     过渡态竞态(该清没清/该激活没激活)。等 80ms 布局稳定后统一读最终态
     决定,末次写入必然正确。 */
  let syncTimer = null;
  const requestSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (MQ.matches) {
        retarget();                 // 宽度变了两列高度全变,"谁短"可能翻转
        if (el) activate();         // 重量基线（vh / H / gapTop 全部重取）
      } else {
        deactivate();               // <900px:清 inline,回落断点内 CSS 基座
      }
    }, 80);
  };
  window.addEventListener('resize', requestSync);
  MQ.addEventListener ? MQ.addEventListener('change', requestSync) : MQ.addListener(requestSync);

  document.addEventListener('pjax:send', teardown);
  document.addEventListener('pjax:complete', init);
  init();                           // defer 阶段 DOM 已完整
})();
