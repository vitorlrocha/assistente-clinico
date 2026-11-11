// Conferência do documento gerado pela IA.
// Base científica (resumo):
// - CIDs: IAs inventam muitos códigos CID-10 "de cabeça" (Soroush et al., NEJM AI 2024); consultar a tabela
//   oficial melhora muito a precisão (Klang et al., NEJM AI 2025). Aqui todo CID é conferido na CID-10 do DATASUS.
// - Omissões: perguntar à IA "o que falta?" detecta poucas omissões; listar os fatos do ORIGINAL e conferir
//   um a um funciona melhor (arXiv 2608.31016, 2026). Fazemos isso de 2 jeitos: instantâneo (trechos do texto)
//   e com a IA (botão "Conferir fato por fato").
// - Alucinações: palavras do documento que não existem no original nem nas instruções da tarefa são destacadas.

let CID10 = null;
fetch('/api/cid10').then((r) => r.json()).then((d) => { CID10 = d; }).catch(() => {});
const cacheInstrucao = {};
async function instrucaoAtual() {
  const id = estado.tarefa; if (!id) return '';
  if (!(id in cacheInstrucao)) { try { cacheInstrucao[id] = await (await fetch('/api/instrucao?id=' + encodeURIComponent(id))).text(); } catch (e) { cacheInstrucao[id] = ''; } }
  return cacheInstrucao[id];
}

// ---------- Normalização e sinônimos ----------
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const PARADAS = new Set(('DE DA DO DAS DOS EM NO NA NOS NAS COM PARA POR PELO PELA PELOS PELAS QUE UM UMA UNS UMAS OS AS AO AOS ' +
  'HA HAS MAS MAIS MENOS ESTA ESTAR ESTAVA FOI SER TEM TER SUA SEU SUAS SEUS ELE ELA ISSO ESSE ESSA ESTE ESTA COMO QUANDO ' +
  'ONDE TAMBEM JA AINDA BEM MUITO POUCO VEZ VEZES APOS ANTES DEPOIS ENTRE SOBRE ATE DESDE SE OU NEM SO APENAS CADA ' +
  'PACIENTE PCTE REFERE RELATA APRESENTA PORTADOR PORTADORA USO EM USO').split(/\s+/));
// Grupos de termos equivalentes (abreviação ⇄ por extenso). Prefixos de 5 letras cobrem plural e gênero.
const SINONIMOS = [
  ['DISPNEIA', 'FALTA DE AR', 'CANSACO'], ['SEQUELA', 'POS'], ['DIREITO', 'DIREITA', 'D'], ['ESQUERDO', 'ESQUERDA', 'E'],
  ['HAS', 'HIPERTENSAO', 'HIPERTENSO', 'HIPERTENSA', 'PRESSAO ALTA'], ['DM', 'DM2', 'DIABETES', 'DIABETICO', 'DIABETICA', 'DIABETE'],
  ['CA', 'CANCER', 'NEOPLASIA'], ['GTT', 'GASTROSTOMIA'], ['SNG', 'SONDA', 'NASOGASTRICA'], ['MMII', 'MEMBROS INFERIORES', 'PERNAS'],
  ['MMSS', 'MEMBROS SUPERIORES', 'BRACOS'], ['AA', 'AMBIENTE'], ['ECG', 'ELETROCARDIOGRAMA'], ['RNM', 'RESSONANCIA'], ['TC', 'TOMOGRAFIA'],
  ['USG', 'ULTRASSOM', 'ULTRASSONOGRAFIA', 'ECOGRAFIA'], ['ENMG', 'ELETRONEUROMIOGRAFIA', 'ELETRONEURMIOGRAFICO', 'ELETRONEUROMIOGRAFICO'],
  ['HB', 'HEMOGLOBINA'], ['HT', 'HEMATOCRITO'], ['PLAQ', 'PLAQUETAS'], ['LEUCO', 'LEUCOCITOS'], ['K', 'POTASSIO'], ['NA', 'SODIO'],
  ['CT', 'COLESTEROL'], ['TG', 'TRIGLICERIDEOS'], ['PA', 'PRESSAO'], ['FC', 'FREQUENCIA'], ['SAT', 'SATURACAO', 'SPO2', 'SATO2'],
  ['AAS', 'ACIDO ACETILSALICILICO'], ['HCTZ', 'HIDROCLOROTIAZIDA'], ['SRO', 'REIDRATACAO'], ['ICC', 'INSUFICIENCIA CARDIACA'],
  ['IAM', 'INFARTO'], ['AVC', 'DERRAME'], ['NEGA', 'SEM', 'NAO', 'NEGATIVO', 'NEGATIVA', 'AUSENCIA', 'AUSENTE'],
  ['TORACICA', 'PEITO', 'TORAX'], ['CEFALEIA', 'DOR DE CABECA'], ['TONTURA', 'VERTIGEM'], ['EDEMA', 'INCHACO', 'INCHADO', 'INCHADA'],
  ['DEAMBULANDO', 'ANDANDO', 'DEAMBULA'], ['ESCARA', 'LESAO POR PRESSAO', 'LPP'], ['CD', 'CONDUTA'], ['RETORNO', 'RETORNAR', 'REAVALIACAO'],
  ['PRESCREVO', 'PRESCRITO', 'PRESCRITA', 'INICIO', 'INICIADO', 'INICIADA', 'INICIAR'], ['RENOVO', 'RENOVADO', 'RENOVADA', 'MANTIDO', 'MANTIDA', 'MANTER'],
  ['ENCAMINHO', 'ENCAMINHAR', 'ENCAMINHADO', 'ENCAMINHADA', 'ENCAMINHAMENTO'], ['ORIENTO', 'ORIENTADO', 'ORIENTADA', 'ORIENTACAO', 'ORIENTACOES'],
  ['SUICIDA', 'SUICIDIO', 'MORTE', 'MORRER', 'ACORDAR', 'AUTOLITICA', 'AUTOEXTERMINIO'], ['DIA', 'DIARIO', 'DIARIA', 'AO DIA', 'X/DIA'],
];
const pref = (w) => (w.length > 5 ? w.slice(0, 5) : w);
const MAPA_SIN = new Map();
// Só palavras com sentido entram nos grupos ("DE", "AO"... ficam de fora, senão qualquer texto "contém" o sinônimo).
const ABREV_CURTAS = new Set(['D', 'E', 'K', 'NA', 'PA', 'FC', 'HB', 'HT', 'TC', 'CA', 'DM', 'AA', 'CD']);
for (const g of SINONIMOS) {
  const chaves = [...new Set(g.flatMap((x) => norm(x).split(/[^A-Z0-9]+/))
    .filter((w) => w && !PARADAS.has(w) && w !== 'DE' && w !== 'AO' && (w.length >= 3 || ABREV_CURTAS.has(w))).map(pref))];
  for (const c of chaves) MAPA_SIN.set(c, [...new Set([...(MAPA_SIN.get(c) || []), ...chaves])]);
}
function normNumero(n) { return n.replace(/[.,]/g, '').replace(/^0+(?=\d)/, ''); }
function termos(texto) {
  const t = norm(texto), out = [];
  for (const n of t.match(/\d+(?:[.,]\d+)*/g) || []) out.push({ tipo: 'n', v: normNumero(n), orig: n });
  for (const w of t.replace(/\d+(?:[.,]\d+)*/g, ' ').split(/[^A-Z0-9]+/)) {
    if (w.length < 3 && !['D', 'E', 'K', 'PA', 'FC', 'HB', 'HT', 'TC', 'CA', 'DM', 'AA'].includes(w)) continue;
    if (PARADAS.has(w)) continue;
    out.push({ tipo: 'p', v: w, orig: w });
  }
  return out;
}
function indice(texto) {
  const t = norm(texto), prefixos = new Set(), nums = new Set();
  for (const n of t.match(/\d+(?:[.,]\d+)*/g) || []) nums.add(normNumero(n));
  for (const w of t.replace(/\d+(?:[.,]\d+)*/g, ' ').split(/[^A-Z0-9]+/)) if (w) prefixos.add(pref(w));
  return { prefixos, nums };
}
function presente(termo, idx) {
  if (termo.tipo === 'n') return idx.nums.has(termo.v);
  const p = pref(termo.v);
  if (idx.prefixos.has(p)) return true;
  return (MAPA_SIN.get(p) || []).some((s) => idx.prefixos.has(s));
}
function cobertura(texto, idx) {
  const ts = termos(texto); if (!ts.length) return { cob: 1, faltam: [] };
  const faltam = ts.filter((x) => !presente(x, idx));
  // número ausente pesa o dobro: valores e doses são críticos
  const peso = ts.reduce((s, x) => s + (x.tipo === 'n' ? 2 : 1), 0), perdido = faltam.reduce((s, x) => s + (x.tipo === 'n' ? 2 : 1), 0);
  return { cob: 1 - perdido / peso, faltam };
}

// ---------- Trechos do original (enumeração instantânea, sem IA) ----------
const RUIDO = /\b(CNS|CPF|EQUIPE|HTTPS?|WWW|BEM[- ]VIND|BOA TARDE|BOM DIA|BOA NOITE|DESEJO MELHORAS|OBRIGAD|AUDIO|CAMERA|PLATAFORMA)\b/;
function trechos(texto) {
  return norm(texto)
    .split(/\n|\s\/\s|\/(?=\s*[A-Z])|;|\.(?=\s|$)|,(?=\s)|:(?=\s)|\?|!/)
    .map((s) => s.replace(/^[\s\-–#*"']+|[\s"']+$/g, '').trim())
    .filter((s) => s.length >= 4 && !RUIDO.test(s) && termos(s).length >= 1);
}

// ---------- Conferência automática (instantânea) ----------
const RE_DATA = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;
const RE_CID = /\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b/g;
function normData(d) { const p = d.split('/').map((x) => String(parseInt(x, 10))); if (p[2]) p[2] = p[2].slice(-2); return p.join('/'); }
function extrair(texto) {
  const datas = new Map(), nums = new Map(), cids = new Map();
  let t = texto.replace(/CID-?10/gi, ' ');
  (t.match(RE_CID) || []).forEach((c) => cids.set(c, c));
  t = t.replace(RE_CID, ' ');
  (t.match(RE_DATA) || []).forEach((d) => datas.set(normData(d), d));
  t = t.replace(RE_DATA, ' ');
  (t.match(/\d+(?:[.,]\d+)*/g) || []).forEach((n) => { const k = normNumero(n); if (k.length <= 10) nums.set(k, n); });
  return { datas, nums, cids };
}
function textoOriginal() { return estado.conversa.filter((m) => m.role === 'user').map((m) => m.texto || '').join('\n'); }
function documentoAtual() { const u = [...estado.conversa].reverse().find((m) => m.role === 'assistant'); return u ? u.texto : ''; }
const item = (classe, html) => `<div class="item ${classe}">${html}</div>`;

async function conferenciaAutomatica() {
  const orig = textoOriginal(), doc = documentoAtual().replace(/```[a-zA-Z]*\n?/g, '');
  // Na pesquisa em livros não há "texto original" para comparar: a conferência é feita pelas fontes citadas.
  const ehPesquisa = estado.tarefa === '__livros__';
  $('conferencia').classList.toggle('oculto', !doc || ehPesquisa); $('confIA').innerHTML = '';
  if (!doc || ehPesquisa) return;
  const temFotos = estado.conversa.some((m) => (m.imagens || []).length || m.nImagens);
  const criticos = [], avisos = [], oks = [];
  const a = extrair(orig), b = extrair(doc);

  // 1) Segurança: ideação suicida / de morte
  const RE_IDEACAO = /(SUICID|AUTOEXTERMIN|AUTOLIT|SE MATAR|TIRAR A (PROPRIA )?VIDA|MELHOR NAO (ACORDAR|EXISTIR|ESTAR AQUI)|DESISTIR DE TUDO|ACABAR COM TUDO|(PENS|VONTADE|DESEJ|IDEIA|QUER)\w*\s+(\w+\s+){0,4}(MORRER|MORTE|SUMIR|NAO ACORDAR))/;
  const RE_NEGADA = /(SEM|NEGA|NEGOU|NEGANDO|AUSENCIA DE|NAO HA|NAO TEM)\s+(RELATO DE\s+|PENSAMENTOS? DE\s+)?(IDEACAO|IDEIAS?|PLANOS?|INTENCAO)?\s*(SUICIDA|DE MORTE|SUICIDIO|AUTOLITICA)?/g;
  const origSemNegacao = norm(orig).replace(RE_NEGADA, ' ');
  if (RE_IDEACAO.test(origSemNegacao) && /SEM (RELATO DE )?IDEACAO|NEGA IDEACAO|AUSENCIA DE IDEACAO/.test(norm(doc)))
    criticos.push('O original fala em morte, suicídio ou "desistir", mas o documento diz <b>sem ideação</b>. Confira o registro de risco.');

  // 2) Lateralidade
  const lado = (t, re) => re.test(norm(t));
  const ladoOrig = { E: lado(orig, /ESQUERD|\b(MIE|MSE)\b|[A-Z]{4,}\s+E\b(?!\s+[A-Z]{3,})/), D: lado(orig, /DIREIT|\b(MID|MSD)\b|[A-Z]{4,}\s+D\b/) };
  const ladoDoc = { E: lado(doc, /ESQUERD|\b(MIE|MSE)\b/), D: lado(doc, /DIREIT|\b(MID|MSD)\b/) };
  if (ladoOrig.E && !ladoDoc.E) criticos.push('O original cita o lado <b>esquerdo</b>, mas o documento não.');
  if (ladoOrig.D && !ladoDoc.D) criticos.push('O original cita o lado <b>direito</b>, mas o documento não.');
  if (ladoDoc.E && !ladoOrig.E) criticos.push('O documento cita o lado <b>esquerdo</b>, que não está no original.');
  if (ladoDoc.D && !ladoOrig.D) criticos.push('O documento cita o lado <b>direito</b>, que não está no original.');

  // 3) CID-10: existe na tabela oficial? foi a IA que escolheu?
  for (const c of b.cids.keys()) {
    const desc = CID10 ? CID10[c] : undefined, daIA = !a.cids.has(c);
    if (CID10 && !desc) criticos.push(`CID <b>${escapar(c)}</b> <b>não existe</b> na CID-10 oficial (DATASUS).`);
    else if (daIA) avisos.push(`CID escolhido pela IA: <b>${escapar(c)}</b> — ${escapar(desc || '')}. Confira se corresponde ao caso.`);
    else oks.push(`CID ${escapar(c)} — ${escapar(desc || '')}`);
  }

  if (!temFotos) {
    // 4) Números e datas
    const faltam = [...a.datas.keys()].filter((k) => !b.datas.has(k)).map((k) => a.datas.get(k))
      .concat([...a.nums.keys()].filter((k) => !b.nums.has(k)).map((k) => a.nums.get(k)));
    const sobram = [...b.datas.keys()].filter((k) => !a.datas.has(k)).map((k) => b.datas.get(k))
      .concat([...b.nums.keys()].filter((k) => !a.nums.has(k)).map((k) => b.nums.get(k)));
    if (faltam.length) avisos.push('Números ou datas do original que <b>não aparecem</b> no documento: ' + escapar(faltam.join(' · ')));
    else oks.push('Todos os números e datas do original aparecem no documento.');
    if (sobram.length) avisos.push('Números ou datas no documento que <b>não estão no original</b>: ' + escapar(sobram.join(' · ')));

    // 5) Trechos do original que parecem ter sumido
    const idxDoc = indice(doc);
    const sumidos = trechos(orig).map((t) => ({ t, ...cobertura(t, idxDoc) })).filter((x) => x.cob < 0.6);
    if (sumidos.length) avisos.push('Trechos do original que <b>podem ter sido omitidos</b>: ' + sumidos.slice(0, 10).map((x) => '«' + escapar(x.t.toLowerCase()) + '»').join(' · '));
    else oks.push('Todos os trechos do original parecem estar no documento.');

    // 6) Palavras novas (não estavam no original nem nas instruções da tarefa)
    const idxOrig = indice(orig + '\n' + (await instrucaoAtual()));
    const novas = [...new Set(termos(doc).filter((x) => x.tipo === 'p' && x.v.length >= 4 && !presente(x, idxOrig)).map((x) => x.orig))];
    if (novas.length) avisos.push('Palavras que <b>não estavam no original</b> (confira se não foram inventadas ou trocadas): ' + escapar(novas.slice(0, 20).join(', ').toLowerCase()));
  } else {
    avisos.push('Documento feito a partir de fotos: confira os valores com o laudo original.');
  }

  $('confAuto').innerHTML =
    criticos.map((x) => item('critico', '⛔ ' + x)).join('') +
    avisos.map((x) => item('atencao', '⚠️ ' + x)).join('') +
    oks.map((x) => item('ok', '✓ ' + x)).join('');
}

// ---------- Conferência fato por fato, com a IA ----------
$('btnConferirIA').onclick = async () => {
  const doc = documentoAtual(); if (!doc || estado.controlador) return;
  const btn = $('btnConferirIA'); btn.disabled = true; $('btnGerar').disabled = true; $('btnAjuste').disabled = true;
  $('confIA').innerHTML = '<div class="ia pensando">A IA está listando os fatos do texto original (sem ver o documento)… cerca de 1 minuto.</div>';
  estado.controlador = new AbortController();
  try {
    const r = await fetch('/api/fatos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: estado.controlador.signal,
      body: JSON.stringify({ original: textoOriginal() }),
    });
    const dados = await r.json(); if (!r.ok) throw new Error(dados.erro || ('Erro ' + r.status));
    const idx = indice(doc.replace(/```[a-zA-Z]*\n?/g, ''));
    const res = dados.fatos.map((f) => ({ f, ...cobertura(f, idx) }));
    const ausentes = res.filter((x) => x.cob < 0.6), duvidosos = res.filter((x) => x.cob >= 0.6 && x.cob < 0.85);
    let html = `<div class="ia"><b>${res.length - ausentes.length} de ${res.length} fatos do original foram encontrados no documento.</b>`;
    if (ausentes.length) html += '<br>⚠️ <b>Provavelmente omitidos:</b><br>' + ausentes.map((x) => '• ' + escapar(x.f)).join('<br>');
    if (duvidosos.length) html += '<br>Conferir (parcialmente encontrados):<br>' + duvidosos.map((x) => '• ' + escapar(x.f) + ' <span class="meta">(não achei: ' + escapar(x.faltam.map((t) => t.orig.toLowerCase()).join(', ')) + ')</span>').join('<br>');
    if (!ausentes.length && !duvidosos.length) html += '<br>✓ Nenhuma omissão encontrada.';
    $('confIA').innerHTML = html + '</div>';
  } catch (e) {
    if (e.name !== 'AbortError') $('confIA').innerHTML = '<div class="erro-msg">Erro na conferência: ' + escapar(e.message) + '</div>';
    else $('confIA').innerHTML = '';
  } finally {
    estado.controlador = null; btn.disabled = false; $('btnGerar').disabled = false; $('btnAjuste').disabled = false;
    aquecer(); // volta a deixar a instrução da tarefa pré-lida
  }
};

// ---------- Busca de CID-10 oficial ----------
$('buscaCid').addEventListener('input', async (e) => {
  const q = e.target.value.trim(), box = $('resCid');
  if (q.length < 2) { box.innerHTML = ''; return; }
  const lista = await (await fetch('/api/cid?q=' + encodeURIComponent(q))).json();
  box.innerHTML = lista.length ? '' : '<div class="dica" style="padding:4px">Nada encontrado.</div>';
  for (const c of lista) {
    const d = document.createElement('div'); d.className = 'cid-item'; d.title = 'Clique para copiar o código';
    d.innerHTML = '<b></b> <span></span>'; d.querySelector('b').textContent = c.codigo; d.querySelector('span').textContent = c.descricao;
    d.onclick = () => copiar(c.codigo, d.querySelector('b'));
    box.appendChild(d);
  }
});
