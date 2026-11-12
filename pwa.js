// Aplicativo instalável (PWA): registra o service worker, cuida da atualização automática e avisa quando não há internet.
(() => {
  // ----- Aviso "Sem internet" no topo -----
  const aviso = document.createElement('span');
  aviso.id = 'semInternet'; aviso.textContent = 'Sem internet';
  aviso.style.cssText = 'font-size:12px;padding:3px 10px;border-radius:980px;background:var(--alerta);color:#fff;display:none';
  const mostrarRede = () => { aviso.style.display = navigator.onLine ? 'none' : 'inline-block'; };
  window.addEventListener('online', mostrarRede); window.addEventListener('offline', mostrarRede);
  window.addEventListener('DOMContentLoaded', () => { document.querySelector('.status').prepend(aviso); mostrarRede(); });

  if (!('serviceWorker' in navigator)) return;

  // ----- Atualização -----
  // Se a tela estiver ociosa (nada digitado, nada gerado), a versão nova entra sozinha.
  // Se você estiver no meio de um trabalho, aparece o botão "Atualizar" e nada é perdido.
  const ocupado = () => {
    const e = document.getElementById('entrada');
    return (e && e.value.trim()) || (typeof estado !== 'undefined' && (estado.conversa.length || estado.controlador));
  };
  function oferecer(sw) {
    if (!ocupado()) { sw.postMessage('ativar'); return; }
    if (document.getElementById('btnAtualizar')) return;
    const b = document.createElement('button'); b.id = 'btnAtualizar'; b.className = 'btn prim'; b.textContent = 'Atualizar';
    b.title = 'Há uma versão nova do aplicativo'; b.style.cssText = 'font-size:12.5px;padding:5px 14px';
    b.onclick = () => sw.postMessage('ativar');
    document.querySelector('.status').prepend(b);
  }
  let recarregando = false;
  const jaControlada = !!navigator.serviceWorker.controller; // primeira visita: não precisa recarregar
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaControlada || recarregando) return;
    recarregando = true; location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      if (reg.waiting && navigator.serviceWorker.controller) oferecer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        novo.addEventListener('statechange', () => {
          if (novo.state !== 'installed') return;
          if (navigator.serviceWorker.controller) oferecer(novo); else novo.postMessage('ativar'); // 1ª instalação
        });
      });
      // procura versão nova ao voltar para o aplicativo e de hora em hora
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (e) { console.warn('PWA: não foi possível registrar o service worker.', e); }
  });
})();
