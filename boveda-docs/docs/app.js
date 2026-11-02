/* Bóveda v2 — interfaz, GitHub, Gemini, temas, editor y grafo. La lógica pura vive en core.js. */
(() => {
  'use strict';
  const C = window.Core;
  const $ = (id) => document.getElementById(id);

  function el(tag, props, ...hijos) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const h of hijos.flat()) if (h != null && h !== false) e.append(h);
    return e;
  }

  // ---------- Almacenamiento local ----------
  const KEY_CFG = 'bov.cfg';
  const KEY_COLA = 'bov.cola';
  const KEY_DRAFT = 'bov.draft';
  const KEY_CACHE = 'bov.cache';
  const CFG0 = {
    owner: '', repo: '', branch: 'main', carpeta: 'notas', token: '',
    usarIA: true, geminiKey: '', modelo: 'gemini-2.5-flash', tema: 'oscuro',
  };
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (_) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* nada */ } },
  };
  const cfg = Object.assign({}, CFG0, store.get(KEY_CFG, {}));
  const guardarCfg = () => store.set(KEY_CFG, cfg);
  const leerCola = () => store.get(KEY_COLA, []);
  const guardarCola = (c) => store.set(KEY_COLA, c);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---------- Estado ----------
  const S = { notas: [], cargada: false, cargando: null, filtroTema: null, abierta: null, grafoCtl: null, sel: null };

  // ---------- Interfaz general ----------
  let tToast;
  function toast(msg, ms = 4200) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(tToast);
    tToast = setTimeout(() => { t.hidden = true; }, ms);
  }
  function mostrarError(msg) { const e = $('error-captura'); e.textContent = msg; e.hidden = false; }
  function ocultarError() { $('error-captura').hidden = true; $('btn-sin-ia').hidden = true; }

  function aplicarTema() {
    const claro = cfg.tema === 'claro';
    document.documentElement.setAttribute('data-tema', claro ? 'claro' : 'oscuro');
    const m = $('meta-color');
    if (m) m.setAttribute('content', claro ? '#f1f6ee' : '#020803');
  }

  const VISTAS = ['capturar', 'revisar', 'notas', 'grafo', 'ajustes'];
  let vistaActual = 'capturar';
  function setVista(v) {
    vistaActual = v;
    for (const n of VISTAS) $('v-' + n).hidden = n !== v;
    const tab = v === 'revisar' ? 'capturar' : v;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === tab));
    if (v === 'notas') { renderCola(); renderNotas(); if (ghListo() && !S.cargada) cargarBoveda(); }
    if (v === 'grafo') { if (ghListo() && !S.cargada) cargarBoveda(); renderGrafo(); }
    window.scrollTo(0, 0);
  }

  // ---------- GitHub ----------
  class ErrorHTTP extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const ghListo = () => Boolean(cfg.owner && cfg.repo && cfg.token);
  const ruta = (nombre) => [cfg.carpeta, nombre].map((s) => String(s || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');

  function ghUrl(path, raiz) {
    const base = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    if (raiz) return base;
    return base + '/contents' + (path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '');
  }
  async function gh(method, path, { body, query, raiz } = {}) {
    const url = ghUrl(path, raiz) + (query ? '?' + new URLSearchParams(query) : '');
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let m = '';
      try { m = (await res.json()).message || ''; } catch (_) { /* sin cuerpo */ }
      throw new ErrorHTTP(res.status, m || res.statusText);
    }
    return res.json();
  }
  function mensajeGH(e) {
    if (e instanceof ErrorHTTP) {
      if (e.status === 401) return 'GitHub rechazó el token (vencido o mal copiado).';
      if (e.status === 403) return 'GitHub rechazó el permiso o la cuota. El token necesita "Contents: lectura y escritura" en ese repo.';
      if (e.status === 404) return 'No encuentro el repositorio, la rama o la carpeta. Revisá usuario, repo, rama y carpeta.';
      if (e.status === 409) return 'Conflicto al escribir; reintentá.';
      return `GitHub respondió ${e.status}: ${e.message}`;
    }
    if (e && e.name === 'TypeError') return 'Sin conexión.';
    return (e && e.message) || String(e);
  }

  async function subirArchivo(item) {
    const base = item.path.replace(/\.md$/, '');
    for (let i = 1; i <= 6; i++) {
      const path = i === 1 ? item.path : `${base}-${i}.md`;
      try {
        await gh('PUT', path, { body: { message: item.message, content: C.utf8ToBase64(item.content), branch: cfg.branch } });
        return path;
      } catch (e) {
        if (e instanceof ErrorHTTP && e.status === 422) {
          try {
            const ex = await gh('GET', path, { query: { ref: cfg.branch } });
            if (!Array.isArray(ex) && C.base64ToUtf8(ex.content) === item.content) return path;
          } catch (_) { /* siguiente nombre */ }
          if (i < 6) continue;
        }
        throw e;
      }
    }
    return null;
  }

  // ---------- Cola de envío ----------
  let enviando = false;
  function renderCola() {
    const cola = leerCola();
    $('aviso-cola').hidden = cola.length === 0;
    $('aviso-cola-txt').textContent = cola.length === 1 ? '1 nota sin enviar' : `${cola.length} notas sin enviar`;
    $('btn-reintentar').disabled = enviando;
    const b = $('badge');
    b.hidden = cola.length === 0;
    b.textContent = String(cola.length);
    const cont = $('pendientes-envio');
    cont.textContent = '';
    if (cola.length) {
      cont.append(
        el('p', { class: 'suave', text: 'Sin enviar (están solo en este dispositivo):' }),
        el('ul', { class: 'lista' }, cola.map((it) => el('li', {}, el('button', {
          type: 'button', text: it.path.split('/').pop(),
          onclick: () => abrirLectorTexto(it.path.split('/').pop(), it.content),
        })))),
      );
    }
  }

  async function vaciarCola({ silencioso = false } = {}) {
    if (enviando) return;
    const cola = leerCola();
    if (!cola.length) return;
    if (!ghListo()) {
      if (!silencioso) toast('Falta configurar GitHub en Ajustes. La nota quedó guardada en este dispositivo.');
      return;
    }
    enviando = true;
    renderCola();
    let enviadas = 0;
    let fallo = null;
    try {
      for (const item of cola) {
        try {
          await subirArchivo(item);
          enviadas++;
          guardarCola(leerCola().filter((x) => x.id !== item.id));
        } catch (e) { fallo = e; break; }
      }
    } finally { enviando = false; renderCola(); }
    if (enviadas) S.cargada = false;
    if (fallo) {
      if (!silencioso || enviadas) toast(`${mensajeGH(fallo)} Quedó en cola, no se perdió.`, 6000);
    } else if (enviadas) {
      toast(enviadas === 1 ? 'Guardada en la bóveda.' : `${enviadas} notas guardadas en la bóveda.`);
    }
    if (enviadas && ghListo()) cargarBoveda();
  }

  // ---------- Gemini ----------
  async function errorGemini(res) {
    let m = '';
    try { m = (await res.json()).error?.message || ''; } catch (_) { /* sin cuerpo */ }
    const e = new Error(m || res.statusText);
    e.status = res.status;
    return e;
  }
  function mensajeIA(e) {
    if (e && e.name === 'AbortError') return 'La IA tardó demasiado.';
    if (e && e.name === 'TypeError') return 'Sin conexión con la IA.';
    if (e && e.status === 429) return 'Se agotó la cuota gratuita de la IA. Probá en un rato o seguí sin ordenar.';
    if (e && (e.status === 400 || e.status === 403)) return `La IA rechazó la clave o el modelo (${e.status}). Revisalos en Ajustes.`;
    if (e && e.status === 404) return 'Ese modelo no existe. En Ajustes, tocá "Ver modelos disponibles".';
    return `La IA falló: ${e && e.message ? e.message : e}`;
  }
  const iaActiva = () => Boolean(cfg.usarIA && cfg.geminiKey && cfg.modelo);

  async function ordenarConIA(dictado) {
    const vocab = C.vocabulario(S.notas);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.modelo)}:generateContent`,
        {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: C.promptSistema() }] },
            contents: [{ role: 'user', parts: [{ text: C.mensajeUsuario(dictado, vocab) }] }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
          }),
        }
      );
      if (!res.ok) throw await errorGemini(res);
      const data = await res.json();
      const texto = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!texto) {
        const razon = data.promptFeedback?.blockReason;
        throw new Error(razon ? `la IA bloqueó el texto (${razon})` : 'la IA no devolvió texto');
      }
      return C.normalizarRespuestaIA(C.extraerJSON(texto), dictado, vocab);
    } finally { clearTimeout(to); }
  }

  async function listarModelos() {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': cfg.geminiKey },
    });
    if (!res.ok) throw await errorGemini(res);
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /flash/i.test(n) && !/(image|tts|audio|live|embedding|robotics|computer|native)/i.test(n));
  }

  // ---------- Selector de temas (reutilizable) ----------
  // Devuelve { nodo, obtener() }. Escribir y Enter/coma agrega; tocar una sugerencia agrega.
  function selectorTemas(iniciales, alCambiar) {
    let temas = C.limpiarTemas(iniciales);
    const caja = el('div', { class: 'temas-ed' });
    const chips = el('div', { class: 'chips' });
    const entrada = el('input', { type: 'text', placeholder: 'agregar tema…', 'aria-label': 'Agregar tema', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false' });
    const sugs = el('div', { class: 'chips sugerencias' });
    const vocab = () => C.vocabulario(S.notas);

    function cambiar(nuevos) {
      temas = C.limpiarTemas(nuevos, vocab().map((v) => v.nombre));
      dibujar();
      if (alCambiar) alCambiar(temas);
    }
    function agregar(t) {
      const n = C.normalizarTema(t);
      if (n) cambiar([...temas, n]);
      entrada.value = '';
    }
    function dibujar() {
      chips.textContent = '';
      for (const t of temas) {
        chips.append(el('button', { type: 'button', class: 'chip on', 'aria-label': `Quitar tema ${t}`, onclick: () => cambiar(temas.filter((x) => x !== t)) }, `${t} ✕`));
      }
      sugs.textContent = '';
      const q = C.plegar(entrada.value);
      const tengo = new Set(temas.map(C.plegar));
      const lista = vocab().filter((v) => !tengo.has(C.plegar(v.nombre)) && (!q || C.plegar(v.nombre).includes(q))).slice(0, 8);
      for (const v of lista) sugs.append(el('button', { type: 'button', class: 'chip', onclick: () => agregar(v.nombre) }, `+ ${v.nombre}`));
    }
    entrada.addEventListener('input', () => {
      if (/[,;]/.test(entrada.value)) { agregar(entrada.value.split(/[,;]/)[0]); return; }
      dibujar();
    });
    entrada.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); agregar(entrada.value); }
    });
    entrada.addEventListener('blur', () => { if (entrada.value.trim()) agregar(entrada.value); });
    caja.append(chips, entrada, sugs);
    dibujar();
    return { nodo: caja, obtener: () => temas.slice(), redibujar: dibujar };
  }

  // ---------- Capturar ----------
  let revision = null;

  function actualizarContador() {
    const n = C.contarPalabras($('dictado').value);
    $('contador').textContent = n === 1 ? '1 palabra' : `${n} palabras`;
  }
  function actualizarBotonRevisar() { $('btn-revisar').textContent = iaActiva() ? 'Ordenar y revisar' : 'Revisar'; }
  function setOcupado(si, txt) {
    const b = $('btn-revisar');
    b.disabled = si;
    if (si) b.textContent = txt; else actualizarBotonRevisar();
  }

  async function alRevisar() {
    ocultarError();
    const dictado = C.limpiarTexto($('dictado').value);
    if (!dictado) { mostrarError('Escribí o dictá algo primero.'); return; }
    const fecha = new Date();
    if (!iaActiva()) { abrirRevision(C.notaDesdeDictado(dictado), fecha); return; }
    if (ghListo() && !S.cargada) { try { await cargarBoveda(); } catch (_) { /* seguimos sin vocabulario */ } }
    setOcupado(true, 'Ordenando…');
    try {
      abrirRevision(await ordenarConIA(dictado), fecha);
    } catch (e) {
      mostrarError(mensajeIA(e));
      $('btn-sin-ia').hidden = false;
    } finally { setOcupado(false); }
  }

  function abrirRevision(r, fecha) {
    revision = { notas: r.notas, avisosGlobales: r.avisosGlobales, fecha, selectores: [] };
    const ul = $('avisos-globales');
    ul.textContent = '';
    for (const a of r.avisosGlobales) ul.append(el('li', { text: a }));
    renderTarjetas();
    setVista('revisar');
  }

  function renderTarjetas() {
    const cont = $('tarjetas');
    cont.textContent = '';
    revision.selectores = [];
    revision.notas.forEach((n, idx) => {
      const tarjeta = el('div', { class: 'tarjeta' + (n.tipo ? '' : ' falta') });
      const sel = el('select', { 'aria-label': 'Tipo de nota' },
        [['', 'Elegí el tipo…'], ['idea', 'Idea'], ['lectura', 'Lectura'], ['recuerdo', 'Recuerdo']]
          .map(([v, t]) => el('option', { value: v, text: t })));
      sel.value = n.tipo;
      sel.addEventListener('change', () => tarjeta.classList.toggle('falta', !sel.value));
      const tit = el('input', { type: 'text', value: n.titulo, 'aria-label': 'Título' });
      tarjeta.append(el('div', { class: 'arriba' }, sel, tit));

      if (n.pregunta) tarjeta.append(el('p', { class: 'pregunta', text: n.pregunta + (n.tipoSugerido ? ` (la IA sugiere: ${n.tipoSugerido})` : '') }));
      if (n.avisos.length) tarjeta.append(el('ul', { class: 'avisos' }, n.avisos.map((a) => el('li', { text: a }))));

      const ta = el('textarea', { 'aria-label': 'Texto de la nota', style: 'margin-top:8px' });
      ta.value = n.texto;
      tarjeta.append(ta);

      tarjeta.append(el('div', { class: 'rotulo-campo', text: 'temas' }));
      const st = selectorTemas(n.temas || []);
      revision.selectores.push(st);
      tarjeta.append(st.nodo);

      if (revision.notas.length > 1) {
        tarjeta.append(el('button', {
          type: 'button', class: 'chico secundario', style: 'margin-top:8px', text: 'Quitar esta nota',
          onclick: () => { sincronizarTarjetas(); revision.notas.splice(idx, 1); renderTarjetas(); },
        }));
      }
      cont.append(tarjeta);
    });
  }

  function sincronizarTarjetas() {
    document.querySelectorAll('#tarjetas .tarjeta').forEach((t, i) => {
      const n = revision.notas[i];
      if (!n) return;
      n.tipo = t.querySelector('select').value;
      n.titulo = t.querySelector('input').value;
      n.texto = t.querySelector('textarea').value;
      const st = revision.selectores[i];
      if (st) {
        const pend = t.querySelector('.temas-ed input');
        n.temas = st.obtener();
        if (pend && pend.value.trim()) n.temas = C.limpiarTemas([...n.temas, pend.value], C.vocabulario(S.notas).map((v) => v.nombre));
      }
    });
  }

  async function guardarRevisadas() {
    if (!revision) return;
    sincronizarTarjetas();
    const els = document.querySelectorAll('#tarjetas .tarjeta');
    let falta = false;
    revision.notas.forEach((n, i) => {
      if (!n.tipo) els[i].classList.add('falta');
      if (!n.tipo || !C.limpiarTexto(n.texto)) falta = true;
    });
    if (!revision.notas.length) { toast('No queda ninguna nota para guardar.'); return; }
    if (falta) { toast('Elegí el tipo de cada nota y no dejes ninguna vacía.'); return; }

    const vocab = C.vocabulario(S.notas).map((v) => v.nombre);
    const cola = leerCola();
    for (const n of revision.notas) {
      const temas = C.limpiarTemas(n.temas, vocab);
      cola.push({
        id: uid(),
        path: ruta(C.nombreArchivo(n.titulo, revision.fecha)),
        content: C.construirNota({ tipo: n.tipo, titulo: n.titulo, texto: n.texto, temas }, revision.fecha),
        message: `Nota: ${C.limpiarLinea(n.titulo)}`,
        creada: Date.now(),
      });
    }
    if (!guardarCola(cola)) {
      toast('No pude guardar en este dispositivo (¿almacenamiento lleno o modo privado?). Copiá tu texto antes de salir.', 8000);
      return;
    }
    $('dictado').value = '';
    store.del(KEY_DRAFT);
    actualizarContador();
    revision = null;
    setVista('capturar');
    renderCola();
    await vaciarCola();
  }

  // ---------- Carga de la bóveda (con caché por sha) ----------
  const claveCache = () => [cfg.owner, cfg.repo, cfg.branch, cfg.carpeta].join('|');
  function leerCache() {
    const c = store.get(KEY_CACHE, null);
    return c && c.clave === claveCache() ? c : { clave: claveCache(), archivos: {} };
  }
  function guardarCache(c) { store.set(KEY_CACHE, c); }
  function notasDesdeCache(c) {
    return Object.entries(c.archivos)
      .map(([path, a]) => C.leerNota(a.md, path.split('/').pop().replace(/\.md$/i, '')))
      .sort((a, b) => b.nombre.localeCompare(a.nombre));
  }

  function cargarBoveda() {
    if (S.cargando) return S.cargando;
    S.cargando = (async () => {
      if (!ghListo()) return;
      const est = $('estado-notas');
      est.textContent = 'Cargando…';
      const cache = leerCache();
      try {
        let lista;
        try {
          const data = await gh('GET', ruta(''), { query: { ref: cfg.branch } });
          lista = (Array.isArray(data) ? data : []).filter((f) => f.type === 'file' && /\.md$/i.test(f.name));
        } catch (e) {
          if (e instanceof ErrorHTTP && e.status === 404) lista = [];
          else throw e;
        }
        const nuevos = {};
        const aBajar = [];
        for (const f of lista) {
          const previo = cache.archivos[f.path];
          if (previo && previo.sha === f.sha) nuevos[f.path] = previo; else aBajar.push(f);
        }
        for (let i = 0; i < aBajar.length; i += 4) {
          await Promise.all(aBajar.slice(i, i + 4).map(async (f) => {
            const d = await gh('GET', f.path, { query: { ref: cfg.branch } });
            nuevos[f.path] = { sha: d.sha || f.sha, md: C.base64ToUtf8(d.content) };
          }));
        }
        cache.archivos = nuevos;
        guardarCache(cache);
        S.notas = notasDesdeCache(cache);
        S.cargada = true;
        est.textContent = '';
      } catch (e) {
        if (Object.keys(cache.archivos).length) {
          S.notas = notasDesdeCache(cache);
          est.textContent = `Mostrando la copia guardada en este dispositivo. ${mensajeGH(e)}`;
        } else {
          est.textContent = mensajeGH(e);
        }
      } finally {
        S.cargando = null;
        refrescarVistas();
      }
    })();
    return S.cargando;
  }

  function refrescarVistas() {
    if (vistaActual === 'notas') renderNotas();
    if (vistaActual === 'grafo') renderGrafo();
  }

  // Modifica una nota en GitHub (siempre sobre la versión más reciente) y actualiza caché y estado.
  async function modificarNota(nombre, cambios) {
    const path = ruta(nombre + '.md');
    for (let intento = 0; intento < 2; intento++) {
      const f = await gh('GET', path, { query: { ref: cfg.branch } });
      const nuevo = C.aplicarCambios(C.base64ToUtf8(f.content), cambios);
      if (nuevo === C.base64ToUtf8(f.content)) return;
      try {
        const r = await gh('PUT', path, {
          body: { message: `Editar: ${nombre}`, content: C.utf8ToBase64(nuevo), sha: f.sha, branch: cfg.branch },
        });
        const cache = leerCache();
        cache.archivos[path] = { sha: (r.content && r.content.sha) || f.sha, md: nuevo };
        guardarCache(cache);
        S.notas = notasDesdeCache(cache);
        return;
      } catch (e) {
        if (e instanceof ErrorHTTP && (e.status === 409 || e.status === 422) && intento === 0) continue;
        throw e;
      }
    }
  }

  // ---------- Notas ----------
  function fichaNota(n, alAbrir) {
    const previa = n.texto.replace(/\s+/g, ' ').slice(0, 110);
    return el('li', {}, el('button', { type: 'button', class: 'ficha ' + (n.estado === 'pendiente' ? 'pend' : ''), onclick: () => alAbrir(n) },
      el('div', { class: 'arriba' },
        el('span', { class: 't-' + n.tipo, text: { idea: '●', lectura: '■', recuerdo: '▲' }[n.tipo] + ' ' + n.tipo }),
        el('span', { class: 'f', text: n.fecha }),
        el('span', { class: 'est', text: n.estado === 'pendiente' ? 'pendiente' : 'trabajada' })),
      el('div', { class: 'titulo', text: n.titulo }),
      el('div', { class: 'previa', text: previa }),
      n.temas.length ? el('div', { class: 'pie', text: n.temas.map((t) => '#' + t.replace(/\s+/g, '-')).join(' ') }) : null));
  }

  function renderNotas() {
    const ul = $('lista-notas');
    const est = $('estado-notas');
    ul.textContent = '';
    if (!ghListo()) { est.textContent = 'Configurá GitHub en Ajustes.'; $('filtro-temas').textContent = ''; $('gestor-temas').textContent = ''; return; }
    const vocab = C.vocabulario(S.notas);
    const fc = $('filtro-temas');
    fc.textContent = '';
    if (S.filtroTema && !vocab.some((v) => C.plegar(v.nombre) === C.plegar(S.filtroTema))) S.filtroTema = null;
    if (vocab.length) {
      fc.append(el('button', { type: 'button', class: 'chip' + (S.filtroTema ? '' : ' on'), onclick: () => { S.filtroTema = null; renderNotas(); } }, 'todas'));
      for (const v of vocab) {
        const on = S.filtroTema && C.plegar(S.filtroTema) === C.plegar(v.nombre);
        fc.append(el('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), onclick: () => { S.filtroTema = on ? null : v.nombre; renderNotas(); } }, `${v.nombre} ${v.n}`));
      }
    }
    const notas = S.filtroTema ? S.notas.filter((n) => n.temas.some((t) => C.plegar(t) === C.plegar(S.filtroTema))) : S.notas;
    for (const n of notas) ul.append(fichaNota(n, (x) => abrirLector(x.nombre)));
    if (!$('estado-notas').textContent.startsWith('Mostrando') && !$('estado-notas').textContent.startsWith('Cargando')) {
      est.textContent = S.cargada ? (S.notas.length ? `${notas.length} de ${S.notas.length} nota(s).` : 'Todavía no hay notas.') : '';
    }
    renderGestorTemas(vocab);
    if (S.abierta) renderLector();
  }

  // ---------- Lector / editor de una nota ----------
  function abrirLectorTexto(nombre, md) {
    S.abierta = { nombre, soloLectura: true, md };
    renderLector();
  }
  function abrirLector(nombre) { S.abierta = { nombre }; renderLector(); $('lector').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function cerrarLector() { S.abierta = null; $('lector').hidden = true; $('lector').textContent = ''; }

  function renderLector() {
    const L = $('lector');
    const a = S.abierta;
    if (!a) { L.hidden = true; return; }
    L.hidden = false;
    L.textContent = '';
    if (a.soloLectura) {
      L.append(el('div', { class: 'meta' }, el('b', { text: a.nombre }), el('button', { type: 'button', class: 'chico secundario', text: 'Cerrar', onclick: cerrarLector })),
        el('pre', { class: 'texto', text: a.md }));
      return;
    }
    const n = S.notas.find((x) => x.nombre === a.nombre);
    if (!n) { L.append(el('p', { class: 'suave', text: 'Esa nota ya no está.' })); return; }

    const msg = el('p', { class: 'suave', 'aria-live': 'polite' });
    const guardando = async (fn) => {
      msg.textContent = 'Guardando…';
      try { await fn(); msg.textContent = 'Guardado.'; refrescarVistas(); } catch (e) { msg.textContent = '✗ ' + mensajeGH(e); }
    };

    L.append(el('div', { class: 'meta' },
      el('span', { class: 't-' + n.tipo, text: { idea: '●', lectura: '■', recuerdo: '▲' }[n.tipo] + ' ' + n.tipo }),
      el('span', { class: 'f', text: n.fecha }),
      el('button', { type: 'button', class: 'chico secundario', text: 'Cerrar', onclick: cerrarLector })));
    L.append(el('h3', { text: n.titulo }));

    L.append(el('div', { class: 'bloque' },
      el('div', { class: 'rotulo-campo', text: 'estado' }),
      el('button', {
        type: 'button', class: 'chico', 'data-accion': 'estado',
        text: n.estado === 'pendiente' ? '○ pendiente — marcar como trabajada' : '● trabajada — volver a pendiente',
        onclick: () => guardando(() => modificarNota(n.nombre, { estado: n.estado === 'pendiente' ? 'trabajada' : 'pendiente' })).then(renderLector),
      })));

    const st = selectorTemas(n.temas, (temas) => guardando(() => modificarNota(n.nombre, { temas })));
    L.append(el('div', { class: 'bloque' }, el('div', { class: 'rotulo-campo', text: 'temas' }), st.nodo));

    // Relaciones (capa opcional y manual)
    const bloqueRel = el('div', { class: 'bloque' }, el('div', { class: 'rotulo-campo', text: 'relaciones (opcional, a mano)' }));
    for (const r of n.relaciones) {
      bloqueRel.append(el('div', { class: 'rel' },
        el('span', { class: 't-' + r.tipo, text: r.tipo }), ' → ', el('span', { text: r.con }),
        el('button', {
          type: 'button', class: 'chico secundario', 'aria-label': 'Quitar relación', text: '✕',
          onclick: () => guardando(() => modificarNota(n.nombre, { relaciones: n.relaciones.filter((x) => x !== r) })).then(renderLector),
        })));
    }
    const selTipo = el('select', { 'aria-label': 'Tipo de relación' }, C.TIPOS_RELACION.map((t) => el('option', { value: t, text: t })));
    const selNota = el('select', { 'aria-label': 'Nota relacionada' }, S.notas.filter((x) => x.nombre !== n.nombre).map((x) => el('option', { value: x.nombre, text: x.titulo })));
    bloqueRel.append(el('div', { class: 'form-rel' }, selTipo, selNota, el('button', {
      type: 'button', class: 'chico', text: 'Agregar',
      onclick: () => {
        if (!selNota.value) return;
        guardando(() => modificarNota(n.nombre, { relaciones: [...n.relaciones, { tipo: selTipo.value, con: selNota.value }] })).then(renderLector);
      },
    })));
    L.append(bloqueRel);

    L.append(el('div', { class: 'bloque' }, el('div', { class: 'rotulo-campo', text: 'texto' }), el('div', { class: 'texto', text: n.texto })), msg);
  }

  // ---------- Gestor de temas (renombrar, fusionar, quitar) ----------
  function renderGestorTemas(vocab) {
    const cont = $('gestor-temas');
    cont.textContent = '';
    if (!vocab.length) { cont.append(el('p', { class: 'suave', text: 'Todavía no hay temas.' })); return; }
    const log = el('pre', { class: 'registro', hidden: true });
    const correr = async (nombre, nuevo) => {
      const afectadas = S.notas.filter((n) => n.temas.some((t) => C.plegar(t) === C.plegar(nombre)));
      log.hidden = false;
      log.textContent = '';
      for (const n of afectadas) {
        try {
          await modificarNota(n.nombre, { temas: C.reemplazarTema(n.temas, nombre, nuevo) });
          log.textContent += `✓ ${n.nombre}\n`;
        } catch (e) { log.textContent += `✗ ${n.nombre}: ${mensajeGH(e)}\n`; }
      }
      renderNotas();
    };
    for (const v of vocab) {
      const campo = el('input', { type: 'text', value: v.nombre, 'aria-label': `Renombrar ${v.nombre}`, autocapitalize: 'none', spellcheck: 'false' });
      cont.append(el('div', { class: 'fila-tema' },
        campo, el('span', { class: 'suave', text: String(v.n) }),
        el('button', {
          type: 'button', class: 'chico', text: 'Renombrar / fusionar',
          onclick: () => {
            const nuevo = C.normalizarTema(campo.value);
            if (!nuevo || C.plegar(nuevo) === C.plegar(v.nombre) && nuevo === v.nombre) return;
            correr(v.nombre, nuevo);
          },
        }),
        el('button', {
          type: 'button', class: 'chico secundario', text: 'Quitar',
          onclick: () => { if (confirm(`¿Quitar el tema "${v.nombre}" de ${v.n} nota(s)? Las notas no se borran.`)) correr(v.nombre, ''); },
        })));
    }
    cont.append(log);
  }

  // ---------- Grafo ----------
  function renderGrafo() {
    const lienzo = $('grafo-lienzo');
    const est = $('grafo-estado');
    if (S.grafoCtl) { S.grafoCtl.destruir(); S.grafoCtl = null; }
    $('grafo-detalle').textContent = '';
    if (!ghListo()) { est.textContent = 'Configurá GitHub en Ajustes.'; return; }
    if (!S.notas.length) { est.textContent = S.cargando ? 'Cargando…' : 'Todavía no hay notas para dibujar.'; return; }
    const g = C.construirGrafo(S.notas, {
      temas: $('g-temas').checked,
      relaciones: $('g-rel').checked,
      minNotasTema: $('g-repetidos').checked ? 2 : 1,
    });
    C.layoutFuerzas(g.nodes, g.edges, { size: 420, gravedad: 0.35 });
    const nT = g.nodes.filter((n) => n.kind === 'tema').length;
    est.textContent = `${g.nodes.length - nT} notas, ${nT} temas, ${g.edges.length} conexiones. Arrastrá para mover, pellizcá para acercar, tocá un nodo.`;
    S.grafoCtl = window.Grafo.montar(lienzo, g, { alSeleccionar: detalleNodo });
  }

  function detalleNodo(nodo) {
    const d = $('grafo-detalle');
    d.textContent = '';
    if (!nodo) return;
    if (nodo.kind === 'nota') {
      const n = S.notas.find((x) => x.nombre === nodo.nombre);
      if (!n) return;
      d.append(el('div', { class: 'ficha' },
        el('div', { class: 'arriba' }, el('span', { class: 't-' + n.tipo, text: n.tipo }), el('span', { class: 'f', text: n.fecha }), el('span', { class: 'est', text: n.estado })),
        el('div', { class: 'titulo', text: n.titulo }),
        el('div', { class: 'pie', text: n.temas.map((t) => '#' + t.replace(/\s+/g, '-')).join(' ') }),
        el('button', { type: 'button', class: 'chico', text: 'Abrir nota', onclick: () => { setVista('notas'); abrirLector(n.nombre); } })));
    } else {
      const f = C.plegar(nodo.label);
      const notas = S.notas.filter((n) => n.temas.some((t) => C.plegar(t) === f));
      d.append(el('div', { class: 'ficha' },
        el('div', { class: 'titulo', text: '# ' + nodo.label }),
        el('ul', { class: 'lista' }, notas.map((n) => el('li', {}, el('button', { type: 'button', text: n.titulo, onclick: () => { setVista('notas'); abrirLector(n.nombre); } }))))));
    }
  }

  // ---------- Ajustes ----------
  const CAMPOS = {
    'c-owner': 'owner', 'c-repo': 'repo', 'c-branch': 'branch', 'c-carpeta': 'carpeta',
    'c-token': 'token', 'c-geminiKey': 'geminiKey', 'c-modelo': 'modelo',
  };
  function cargarAjustes() {
    for (const [id, k] of Object.entries(CAMPOS)) $(id).value = cfg[k] || '';
    $('c-usarIA').checked = Boolean(cfg.usarIA);
  }
  function enlazarAjustes() {
    for (const [id, k] of Object.entries(CAMPOS)) {
      $(id).addEventListener('input', () => {
        cfg[k] = $(id).value.trim();
        if (k === 'carpeta') cfg.carpeta = cfg.carpeta.replace(/^\/+|\/+$/g, '');
        guardarCfg();
        S.cargada = false;
        actualizarBotonRevisar();
      });
    }
    $('c-usarIA').addEventListener('change', () => { cfg.usarIA = $('c-usarIA').checked; guardarCfg(); actualizarBotonRevisar(); });
  }

  async function probarGitHub() {
    const r = $('res-gh');
    if (!ghListo()) { r.textContent = 'Completá usuario, repositorio y token.'; return; }
    r.textContent = 'Probando…';
    try {
      const repo = await gh('GET', '', { raiz: true });
      const aviso = repo.private === false ? ' ⚠ Ese repositorio es PÚBLICO: tus notas serían visibles para cualquiera. Usá uno privado.' : ' (privado)';
      r.textContent = `✓ Conectado a ${repo.full_name}${aviso}`;
    } catch (e) { r.textContent = '✗ ' + mensajeGH(e); }
  }

  async function verModelos() {
    const r = $('res-ia');
    const cont = $('lista-modelos');
    cont.textContent = '';
    if (!cfg.geminiKey) { r.textContent = 'Pegá primero la clave de API.'; return; }
    r.textContent = 'Consultando…';
    try {
      const ms = await listarModelos();
      r.textContent = ms.length ? 'Tocá uno para usarlo:' : 'No encontré modelos "flash" con esta clave.';
      for (const m of ms.slice(0, 14)) {
        cont.append(el('button', {
          type: 'button', class: 'chip', text: m,
          onclick: () => { cfg.modelo = m; $('c-modelo').value = m; guardarCfg(); r.textContent = `Modelo: ${m}`; },
        }));
      }
    } catch (e) { r.textContent = '✗ ' + mensajeIA(e); }
  }

  function actualizarRed() {
    const e = $('red');
    e.textContent = navigator.onLine ? '' : 'sin conexión';
    e.classList.toggle('off', !navigator.onLine);
  }

  // ---------- Inicio ----------
  function init() {
    aplicarTema();
    cargarAjustes();
    enlazarAjustes();
    actualizarBotonRevisar();

    const borrador = store.get(KEY_DRAFT, '');
    if (borrador) $('dictado').value = borrador;
    actualizarContador();

    // Copia local de la última carga: la lista y el vocabulario existen aunque no haya red.
    if (ghListo()) {
      const c = leerCache();
      if (Object.keys(c.archivos).length) S.notas = notasDesdeCache(c);
    }

    $('dictado').addEventListener('input', () => { actualizarContador(); store.set(KEY_DRAFT, $('dictado').value); });
    $('btn-limpiar').addEventListener('click', () => {
      if ($('dictado').value && !confirm('¿Vaciar el dictado?')) return;
      $('dictado').value = '';
      store.del(KEY_DRAFT);
      actualizarContador();
      ocultarError();
    });
    $('btn-revisar').addEventListener('click', alRevisar);
    $('btn-sin-ia').addEventListener('click', () => {
      const dictado = C.limpiarTexto($('dictado').value);
      if (dictado) { ocultarError(); abrirRevision(C.notaDesdeDictado(dictado), new Date()); }
    });
    $('btn-volver').addEventListener('click', () => { sincronizarTarjetas(); setVista('capturar'); });
    $('btn-guardar').addEventListener('click', guardarRevisadas);
    $('btn-reintentar').addEventListener('click', () => vaciarCola());
    $('btn-actualizar').addEventListener('click', async () => { await vaciarCola({ silencioso: true }); S.cargada = false; cargarBoveda(); });
    $('btn-probar-gh').addEventListener('click', probarGitHub);
    $('btn-modelos').addEventListener('click', verModelos);
    $('btn-tema').addEventListener('click', () => { cfg.tema = cfg.tema === 'claro' ? 'oscuro' : 'claro'; guardarCfg(); aplicarTema(); });
    $('g-mas').addEventListener('click', () => S.grafoCtl && S.grafoCtl.zoom(1.4));
    $('g-menos').addEventListener('click', () => S.grafoCtl && S.grafoCtl.zoom(1 / 1.4));
    $('g-ajustar').addEventListener('click', () => S.grafoCtl && S.grafoCtl.ajustar());
    for (const id of ['g-temas', 'g-rel', 'g-repetidos']) $(id).addEventListener('change', renderGrafo);

    document.querySelectorAll('.tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.vista === 'capturar' && revision && vistaActual !== 'capturar' && vistaActual !== 'revisar') { setVista('revisar'); return; }
        setVista(b.dataset.vista);
      });
    });

    window.addEventListener('online', () => { actualizarRed(); vaciarCola({ silencioso: true }); });
    window.addEventListener('offline', actualizarRed);
    actualizarRed();
    renderCola();

    if (!ghListo()) {
      setVista('ajustes');
      toast('Primero configurá tu bóveda de GitHub.', 6000);
    } else {
      vaciarCola({ silencioso: true });
      cargarBoveda();
    }

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* funciona igual, sin modo sin conexión */ });
    }
  }

  init();
})();
