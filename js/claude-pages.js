/**
 * claude-pages.js — 分类页手风琴交互 + 页脚运行计时
 * 经 inject.bottom 注入,位于 pjax 容器(#body-wrap)之外:整个会话只执行一次,
 * 用 document 级事件委托,pjax 换页后无需重新绑定(严禁改成模板内联脚本)。
 */
(() => {
  document.addEventListener('click', (e) => {
    const head = e.target.closest('.claude-fold-head');
    if (!head) return;
    const fold = head.closest('.claude-fold');
    if (!fold) return;
    const open = fold.classList.toggle('is-open');
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();

/**
 * 页脚运行计时 + 自动年份。
 * #footer 在 #body-wrap 内会被 pjax 整体换掉,所以节点引用不能缓存——
 * 每次 tick 现查 DOM,查不到(如 404 布局)就静默跳过;换页瞬间监听
 * pjax:complete 立即补一次 tick,避免新页脚显示 1 秒占位数字。
 */
(() => {
  const LAUNCH = new Date('2025-12-01T00:00:00+08:00').getTime();
  const pad = (n) => String(n).padStart(2, '0');

  const tick = () => {
    const d = document.getElementById('footer-rt-d');
    if (!d) return;
    let rest = Math.max(0, Date.now() - LAUNCH);
    const days = Math.floor(rest / 864e5);
    rest -= days * 864e5;
    const hours = Math.floor(rest / 36e5);
    rest -= hours * 36e5;
    const mins = Math.floor(rest / 6e4);
    const secs = Math.floor((rest - mins * 6e4) / 1e3);
    d.textContent = days;
    document.getElementById('footer-rt-h').textContent = pad(hours);
    document.getElementById('footer-rt-m').textContent = pad(mins);
    document.getElementById('footer-rt-s').textContent = pad(secs);
    const year = document.getElementById('footer-year');
    if (year) year.textContent = new Date().getFullYear();
  };

  tick();
  setInterval(tick, 1000);
  document.addEventListener('pjax:complete', tick);
})();
