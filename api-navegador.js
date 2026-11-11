// Versão online (GitHub Pages): não existe servidor. Este arquivo faz, dentro do navegador, o papel que o
// server.js faz no PC: intercepta as chamadas "/api/..." da tela e responde aqui mesmo.
// - A IA é chamada direto do navegador (Groq), com a chave que o usuário informa. A chave fica guardada
//   só neste navegador (localStorage) e nunca vai para o GitHub.
// - O histórico também fica só neste navegador.
(() => {
  const GROQ = 'https://api.groq.com/openai/v1';
  // Fila de modelos: cada um tem seu próprio limite gratuito. Só o primeiro lê imagens.
  const MODELOS = [
    { nome: 'Groq', id: 'qwen/qwen3.8-27b', extras: { reasoning_effort: 'none', max_tokens: 900 }, imagens: true },
    { nome: 'Groq (reserva)', id: 'openai/gpt-oss-120b', extras: { reasoning_effort: 'low', max_tokens: 900 }, imagens: false },
  ];
  const INSTRUCAO_FATOS = `Você extrai fatos clínicos de um texto médico em português.
Liste TODOS os fatos clínicos do texto, um por item, curtos (2 a 8 palavras), usando as palavras do próprio texto.
Inclua: queixas e sintomas com tempo de evolução, negativas (ex.: "nega dor torácica"), sinais vitais, achados de exame,
exames com valor e data, diagnósticos e impressões, medicações com dose e posologia, medicações prévias ou suspensas,
alergias, hábitos, antecedentes, lateralidade (direito/esquerdo), ideação suicida ou de morte, condutas e encaminhamentos, prazos.
Não inclua: nome, idade, CPF, CNS, equipe, saudações, textos-padrão de plataforma, links, áudios sem transcrição.
Não interprete, não resuma, não invente. Um fato por item.
Responda só com a lista, um fato por linha, começando cada linha com "- ".`;

  const fetchReal = window.fetch.bind(window);
  const resposta = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
  const guardar = { ler: (k, padrao) => { try { const v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
    gravar: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const chave = () => { try { return localStorage.getItem('groq_chave') || ''; } catch (e) { return ''; } };

  function pedirChave() {
    const atual = chave();
    const nova = prompt('Cole aqui a sua chave do Groq (começa com gsk_).\n\nEla fica guardada só neste navegador, neste aparelho.' +
      (atual ? '\n\nJá existe uma chave guardada. Deixe em branco para apagá-la.' : ''), '');
    if (nova === null) return;
    try { if (nova.trim()) localStorage.setItem('groq_chave', nova.trim()); else localStorage.removeItem('groq_chave'); } catch (e) { alert('Este navegador não permitiu guardar a chave.'); }
  }

  let tarefas = null, cid10 = null, cidBusca = null;
  async function carregarTarefas() { if (!tarefas) tarefas = await (await fetchReal('dados/tarefas.json')).json(); return tarefas; }
  async function carregarCid() {
    if (!cid10) {
      cid10 = await (await fetchReal('dados/cid10.json')).json();
      cidBusca = Object.entries(cid10).map(([c, d]) => [c, d, semAcento(c + ' ' + d)]);
    }
    return cid10;
  }
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  function montarMensagens(sistema, mensagens) {
    const saida = [{ role: 'system', content: sistema }];
    for (const m of mensagens || []) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (role === 'user' && Array.isArray(m.imagens) && m.imagens.length) {
        saida.push({ role, content: [{ type: 'text', text: m.texto || 'Analise as imagens anexadas.' }, ...m.imagens.map((url) => ({ type: 'image_url', image_url: { url } }))] });
      } else saida.push({ role, content: m.texto || '' });
    }
    return saida;
  }

  // Chama a IA; se o primeiro modelo estiver no limite, usa o seguinte; no último, espera o tempo pedido e tenta de novo.
  async function chamarIA(corpo, temImagens, signal) {
    if (!chave()) return resposta({ erro: 'Informe a sua chave do Groq (botão no topo da tela).' }, 401);
    const fila = MODELOS.filter((m) => !temImagens || m.imagens);
    let erro = 'Nenhum modelo disponível.';
    for (const [i, m] of fila.entries()) {
      const pedir = () => fetchReal(GROQ + '/chat/completions', { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + chave() },
        body: JSON.stringify({ model: m.id, ...corpo, ...m.extras }) });
      let r = await pedir();
      if (r.ok) return new Response(r.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'X-Provedor-IA': encodeURIComponent(m.nome) } });
      let texto = (await r.text()).slice(0, 300);
      if (r.status === 401) return resposta({ erro: 'A chave do Groq não foi aceita. Clique em "Chave" no topo e informe de novo.' }, 401);
      if (r.status === 429 && i === fila.length - 1) {
        const espera = Number(r.headers.get('retry-after')) || Number((texto.match(/try again in ([\d.]+)s/) || [])[1]) || 0;
        if (espera > 0 && espera <= 30) {
          await new Promise((ok) => setTimeout(ok, espera * 1000 + 500));
          r = await pedir();
          if (r.ok) return new Response(r.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'X-Provedor-IA': encodeURIComponent(m.nome) } });
          texto = (await r.text()).slice(0, 300);
        }
      }
      erro = r.status === 429 ? 'Limite gratuito por minuto atingido. Aguarde cerca de 1 minuto e tente de novo.' : `Erro ${r.status}: ${texto}`;
    }
    return resposta({ erro }, 502);
  }

  async function rota(caminho, url, opcoes) {
    const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : {};
    const metodo = ((opcoes && opcoes.method) || 'GET').toUpperCase();
    if (caminho === '/api/tarefas') return resposta((await carregarTarefas()).map((t) => ({ id: t.id, nome: t.nome })));
    if (caminho === '/api/status') { const ok = !!chave(); return resposta({ nome: 'Groq', online: ok, instalado: ok, carregado: ok, modelo: MODELOS[0].id }); }
    if (caminho === '/api/iniciar-ia') { pedirChave(); return resposta({ ok: true }); }
    if (caminho === '/api/aquecer') return resposta({ ok: true });
    if (caminho === '/api/instrucao') { const t = (await carregarTarefas()).find((x) => x.id === url.searchParams.get('id')); return new Response(t ? t.instrucao : '', { status: 200 }); }
    if (caminho === '/api/cid10') return resposta(await carregarCid());
    if (caminho === '/api/cid') {
      await carregarCid();
      const ts = semAcento(url.searchParams.get('q') || '').split(/\s+/).filter(Boolean);
      return resposta(ts.length ? cidBusca.filter(([, , t]) => ts.every((x) => t.includes(x))).slice(0, 30).map(([c, d]) => ({ codigo: c, descricao: d })) : []);
    }
    if (caminho === '/api/gerar') {
      const t = (await carregarTarefas()).find((x) => x.id === corpo.tarefa);
      if (!t) return resposta({ erro: 'Tarefa não encontrada.' }, 400);
      const temImagens = (corpo.mensagens || []).some((m) => (m.imagens || []).length);
      return chamarIA({ temperature: 0.2, top_p: 0.95, stream: true, messages: montarMensagens(t.instrucao, corpo.mensagens) }, temImagens, opcoes.signal);
    }
    if (caminho === '/api/fatos') {
      const r = await chamarIA({ temperature: 0, stream: false, messages: [{ role: 'system', content: INSTRUCAO_FATOS }, { role: 'user', content: corpo.original || '' }] }, false, opcoes.signal);
      if (!r.ok) return r;
      const dados = await r.json();
      const fatos = ((dados.choices && dados.choices[0].message.content) || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l.length > 1);
      return fatos.length ? resposta({ fatos: [...new Set(fatos)] }) : resposta({ erro: 'A IA não devolveu a lista de fatos.' }, 502);
    }
    if (caminho === '/api/historico') {
      let lista = guardar.ler('historico', []);
      if (metodo === 'GET') return resposta(lista);
      if (metodo === 'POST') { lista = [corpo, ...lista.filter((h) => h.id !== corpo.id)].slice(0, 200); guardar.gravar('historico', lista); return resposta({ ok: true }); }
      if (metodo === 'DELETE') { const id = url.searchParams.get('id'); guardar.gravar('historico', id ? lista.filter((h) => h.id !== id) : []); return resposta({ ok: true }); }
    }
    return resposta({ erro: 'Não encontrado' }, 404);
  }

  window.fetch = (entrada, opcoes) => {
    if (typeof entrada === 'string' && entrada.startsWith('/api/')) {
      const url = new URL(entrada, location.origin);
      return rota(url.pathname, url, opcoes || {}).catch((e) => { if (e.name === 'AbortError') throw e; return resposta({ erro: e.message }, 500); });
    }
    return fetchReal(entrada, opcoes);
  };

  // Botão "Chave" no topo, para informar, trocar ou apagar a chave neste aparelho.
  window.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Chave'; b.style.fontSize = '12.5px'; b.style.padding = '5px 12px';
    b.onclick = () => { pedirChave(); if (typeof atualizarStatus === 'function') atualizarStatus(); };
    document.querySelector('.status').appendChild(b);
  });
})();
