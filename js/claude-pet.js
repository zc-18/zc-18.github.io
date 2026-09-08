(() => {
  'use strict';
  if (window.__clPetBoot) return;
  window.__clPetBoot = true;
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
    document.querySelectorAll('.cl-pet-launch').forEach(button => button.setAttribute('aria-expanded', String(!!app?.room)));
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
  document.addEventListener('pjax:send', () => { generation++; if (app) app.suspend(); });
  document.addEventListener('pjax:complete', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
