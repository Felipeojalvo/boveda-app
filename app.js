/* Bóveda — interfaz, GitHub, Gemini y cola de envío. La lógica pura vive en core.js. */
(() => {
  'use strict';
  const C = window.Core;
  const $ = (id) => document.getElementById(id);

  // ---------- Almacenamiento local ----------
  const KEY_CFG = 'bov.cfg';
  const KEY_COLA = 'bov.cola';
  const KEY_DRAFT = 'bov.draft';
  const CFG0 = {
    owner: '', repo: '', branch: 'main', carpeta: 'notas', token: '',
    usarIA: true, geminiKey: '', modelo: 'gemini-2.5-flash',
  };
  const store = {
    get(k, def) {
      try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (_) { return def; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* nada */ } },
  };
  const cfg = Object.assign({}, CFG0, store.get(KEY_CFG, {}));
  const guardarCfg = () => store.set(KEY_CFG, cfg);
  const leerCola = () => store.get(KEY_COLA, []);
  const guardarCola = (c) => store.set(KEY_COLA, c);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---------- Utilidades de interfaz ----------
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

  let vistaActual = 'capturar';
  let listaCargada = false;
  function setVista(v) {
    vistaActual = v;
    for (const n of ['capturar', 'revisar', 'notas', 'ajustes']) $('v-' + n).hidden = n !== v;
    const tab = v === 'revisar' ? 'capturar' : v;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === tab));
    if (v === 'notas') { renderCola(); if (ghListo() && !listaCargada) cargarLista(); }
    window.scrollTo(0, 0);
  }

  // ---------- GitHub ----------
  class ErrorHTTP extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }
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
      if (e.status === 404) return 'No encuentro el repositorio, la rama o la carpeta. Revisá usuario, repo y rama; el token debe tener acceso a ese repo.';
      if (e.status === 409) return 'Conflicto al escribir; reintentá.';
      return `GitHub respondió ${e.status}: ${e.message}`;
    }
    if (e && e.name === 'TypeError') return 'Sin conexión.';
    return (e && e.message) || String(e);
  }

  // Sube un archivo nuevo. Si el nombre ya existe con otro contenido, prueba -2, -3…
  // Si existe con el MISMO contenido (reintento tras un corte), lo da por guardado.
  async function subirArchivo(item) {
    const base = item.path.replace(/\.md$/, '');
    for (let i = 1; i <= 6; i++) {
      const path = i === 1 ? item.path : `${base}-${i}.md`;
      try {
        await gh('PUT', path, {
          body: { message: item.message, content: C.utf8ToBase64(item.content), branch: cfg.branch },
        });
        return path;
      } catch (e) {
        if (e instanceof ErrorHTTP && e.status === 422) {
          try {
            const ex = await gh('GET', path, { query: { ref: cfg.branch } });
            if (!Array.isArray(ex) && C.base64ToUtf8(ex.content) === item.content) return path;
          } catch (_) { /* seguimos con el siguiente nombre */ }
          if (i < 6) continue;
        }
        throw e;
      }
    }
    return null;
  }

  // ---------- Cola de envío (una nota nunca se pierde) ----------
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
      const p = document.createElement('p');
      p.className = 'suave';
      p.textContent = 'Sin enviar (están solo en este dispositivo):';
      cont.appendChild(p);
      const ul = document.createElement('ul');
      ul.className = 'lista';
      for (const it of cola) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = it.path.split('/').pop();
        btn.addEventListener('click', () => mostrarLector(it.path.split('/').pop(), it.content));
        li.appendChild(btn);
        ul.appendChild(li);
      }
      cont.appendChild(ul);
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
    if (enviadas) listaCargada = false;
    if (fallo) {
      if (!silencioso || enviadas) toast(`${mensajeGH(fallo)} Quedó en cola, no se perdió.`, 6000);
    } else if (enviadas) {
      toast(enviadas === 1 ? 'Guardada en la bóveda.' : `${enviadas} notas guardadas en la bóveda.`);
      if (vistaActual === 'notas') cargarLista();
    }
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
            contents: [{ role: 'user', parts: [{ text: 'Dictado a ordenar:\n\n' + dictado }] }],
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
      return C.normalizarRespuestaIA(C.extraerJSON(texto), dictado);
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

  // ---------- Capturar ----------
  let revision = null; // { notas, avisosGlobales, fecha }

  function actualizarContador() {
    const n = C.contarPalabras($('dictado').value);
    $('contador').textContent = n === 1 ? '1 palabra' : `${n} palabras`;
  }
  function actualizarBotonRevisar() {
    $('btn-revisar').textContent = iaActiva() ? 'Ordenar y revisar' : 'Revisar';
  }
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
    setOcupado(true, 'Ordenando…');
    try {
      abrirRevision(await ordenarConIA(dictado), fecha);
    } catch (e) {
      mostrarError(mensajeIA(e));
      $('btn-sin-ia').hidden = false;
    } finally { setOcupado(false); }
  }

  function abrirRevision(r, fecha) {
    revision = { notas: r.notas, avisosGlobales: r.avisosGlobales, fecha };
    const ul = $('avisos-globales');
    ul.textContent = '';
    for (const a of r.avisosGlobales) {
      const li = document.createElement('li');
      li.textContent = a;
      ul.appendChild(li);
    }
    renderTarjetas();
    setVista('revisar');
  }

  function renderTarjetas() {
    const cont = $('tarjetas');
    cont.textContent = '';
    revision.notas.forEach((n, idx) => {
      const el = document.createElement('div');
      el.className = 'tarjeta' + (n.tipo ? '' : ' falta');

      const arriba = document.createElement('div');
      arriba.className = 'arriba';
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Tipo de nota');
      for (const [v, t] of [['', 'Elegí el tipo…'], ['idea', 'Idea'], ['lectura', 'Lectura'], ['recuerdo', 'Recuerdo']]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        sel.appendChild(o);
      }
      sel.value = n.tipo;
      sel.addEventListener('change', () => el.classList.toggle('falta', !sel.value));
      const tit = document.createElement('input');
      tit.type = 'text';
      tit.value = n.titulo;
      tit.setAttribute('aria-label', 'Título');
      arriba.append(sel, tit);
      el.appendChild(arriba);

      if (n.pregunta) {
        const p = document.createElement('p');
        p.className = 'pregunta';
        p.textContent = n.pregunta + (n.tipoSugerido ? ` (la IA sugiere: ${n.tipoSugerido})` : '');
        el.appendChild(p);
      }
      if (n.avisos.length) {
        const ul = document.createElement('ul');
        ul.className = 'avisos';
        for (const a of n.avisos) {
          const li = document.createElement('li');
          li.textContent = a;
          ul.appendChild(li);
        }
        el.appendChild(ul);
      }
      const ta = document.createElement('textarea');
      ta.value = n.texto;
      ta.setAttribute('aria-label', 'Texto de la nota');
      ta.style.marginTop = '8px';
      el.appendChild(ta);

      if (revision.notas.length > 1) {
        const q = document.createElement('button');
        q.type = 'button';
        q.className = 'chico secundario';
        q.textContent = 'Quitar esta nota';
        q.style.marginTop = '8px';
        q.addEventListener('click', () => {
          // conserva lo editado en las demás antes de redibujar
          sincronizarTarjetas();
          revision.notas.splice(idx, 1);
          renderTarjetas();
        });
        el.appendChild(q);
      }
      cont.appendChild(el);
    });
  }

  function sincronizarTarjetas() {
    const els = document.querySelectorAll('#tarjetas .tarjeta');
    els.forEach((el, i) => {
      const n = revision.notas[i];
      if (!n) return;
      n.tipo = el.querySelector('select').value;
      n.titulo = el.querySelector('input').value;
      n.texto = el.querySelector('textarea').value;
    });
  }

  async function guardarRevisadas() {
    if (!revision) return;
    sincronizarTarjetas();
    const els = document.querySelectorAll('#tarjetas .tarjeta');
    let falta = false;
    revision.notas.forEach((n, i) => {
      const mal = !n.tipo || !C.limpiarTexto(n.texto);
      if (!n.tipo) els[i].classList.add('falta');
      if (mal) falta = true;
    });
    if (!revision.notas.length) { toast('No queda ninguna nota para guardar.'); return; }
    if (falta) { toast('Elegí el tipo de cada nota y no dejes ninguna vacía.'); return; }

    const cola = leerCola();
    for (const n of revision.notas) {
      cola.push({
        id: uid(),
        path: ruta(C.nombreArchivo(n.titulo, revision.fecha)),
        content: C.construirNota(n, revision.fecha),
        message: `Nota: ${C.limpiarLinea(n.titulo)}`,
        creada: Date.now(),
      });
    }
    // Primero a la cola local; recién después se envía. Así nada se pierde si falla la red.
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

  // ---------- Notas ----------
  async function cargarLista() {
    const est = $('estado-notas');
    const ul = $('lista-notas');
    if (!ghListo()) { est.textContent = 'Configurá GitHub en Ajustes.'; ul.textContent = ''; return; }
    est.textContent = 'Cargando…';
    try {
      const data = await gh('GET', ruta(''), { query: { ref: cfg.branch } });
      const archivos = (Array.isArray(data) ? data : [])
        .filter((f) => f.type === 'file' && /\.md$/i.test(f.name))
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, 80);
      ul.textContent = '';
      for (const f of archivos) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        const m = /^(\d{4}-\d{2}-\d{2})-(.*)\.md$/.exec(f.name);
        const fecha = document.createElement('span');
        fecha.className = 'f';
        fecha.textContent = m ? m[1] : '';
        const nombre = document.createElement('span');
        nombre.className = 'nombre';
        nombre.textContent = m ? m[2] : f.name;
        b.append(fecha, nombre);
        b.addEventListener('click', () => abrirNota(f.path, f.name));
        li.appendChild(b);
        ul.appendChild(li);
      }
      est.textContent = archivos.length ? `${archivos.length} nota(s), las más recientes primero.` : 'Todavía no hay notas.';
      listaCargada = true;
    } catch (e) {
      ul.textContent = '';
      est.textContent = e instanceof ErrorHTTP && e.status === 404 ? 'Todavía no hay notas (o no encuentro la carpeta).' : mensajeGH(e);
    }
  }
  async function abrirNota(path, nombre) {
    try {
      const f = await gh('GET', path, { query: { ref: cfg.branch } });
      mostrarLector(nombre, C.base64ToUtf8(f.content));
    } catch (e) { toast(mensajeGH(e)); }
  }
  function mostrarLector(nombre, texto) {
    $('lector-nombre').textContent = nombre;
    $('lector-texto').textContent = texto;
    $('lector').hidden = false;
    $('lector').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Aplicar relaciones (cierra el circuito con el proyecto de Claude) ----------
  async function actualizarNota(u) {
    const path = ruta(u.nota + '.md');
    for (let intento = 0; intento < 2; intento++) {
      const f = await gh('GET', path, { query: { ref: cfg.branch } });
      const nuevo = C.aplicarActualizacion(C.base64ToUtf8(f.content), {
        estado: u.estado || undefined, relaciones: u.relaciones,
      });
      try {
        await gh('PUT', path, {
          body: { message: `Relaciones: ${u.nota}`, content: C.utf8ToBase64(nuevo), sha: f.sha, branch: cfg.branch },
        });
        return;
      } catch (e) {
        if (e instanceof ErrorHTTP && (e.status === 409 || e.status === 422) && intento === 0) continue;
        throw e;
      }
    }
  }

  async function aplicarRelaciones() {
    const out = $('resultado-aplicar');
    out.hidden = false;
    out.textContent = '';
    const log = (s) => { out.textContent += s + '\n'; };
    if (!ghListo()) { log('✗ Configurá GitHub en Ajustes.'); return; }
    let ups;
    try { ups = C.validarActualizaciones(C.extraerJSON($('json-relaciones').value)); } catch (e) { log('✗ ' + e.message); return; }

    const btn = $('btn-aplicar');
    btn.disabled = true;
    try {
      let existentes;
      try {
        const l = await gh('GET', ruta(''), { query: { ref: cfg.branch } });
        existentes = new Set(l.filter((f) => f.type === 'file').map((f) => f.name.replace(/\.md$/i, '')));
      } catch (e) { log('✗ No pude leer la bóveda: ' + mensajeGH(e)); return; }

      for (const u of ups) {
        if (!existentes.has(u.nota)) { log(`✗ ${u.nota}: no existe esa nota.`); continue; }
        const faltan = u.relaciones.filter((r) => !existentes.has(r.con)).map((r) => r.con);
        if (faltan.length) { log(`✗ ${u.nota}: no existe ${faltan.join(', ')}. No se tocó.`); continue; }
        try {
          await actualizarNota(u);
          log(`✓ ${u.nota}: ${u.relaciones.length} relación(es)${u.estado ? ', estado ' + u.estado : ''}`);
        } catch (e) { log(`✗ ${u.nota}: ${mensajeGH(e)}`); }
      }
    } finally { btn.disabled = false; }
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
        listaCargada = false;
        actualizarBotonRevisar();
      });
    }
    $('c-usarIA').addEventListener('change', () => {
      cfg.usarIA = $('c-usarIA').checked;
      guardarCfg();
      actualizarBotonRevisar();
    });
  }

  async function probarGitHub() {
    const r = $('res-gh');
    if (!ghListo()) { r.textContent = 'Completá usuario, repositorio y token.'; return; }
    r.textContent = 'Probando…';
    try {
      const repo = await gh('GET', '', { raiz: true });
      const aviso = repo.private === false
        ? ' ⚠ Ese repositorio es PÚBLICO: tus notas serían visibles para cualquiera. Usá uno privado.'
        : ' (privado)';
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
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = m;
        b.addEventListener('click', () => {
          cfg.modelo = m; $('c-modelo').value = m; guardarCfg();
          r.textContent = `Modelo: ${m}`;
        });
        cont.appendChild(b);
      }
    } catch (e) { r.textContent = '✗ ' + mensajeIA(e); }
  }

  // ---------- Red ----------
  function actualizarRed() {
    const el = $('red');
    el.textContent = navigator.onLine ? '' : 'sin conexión';
    el.classList.toggle('off', !navigator.onLine);
  }

  // ---------- Inicio ----------
  function init() {
    cargarAjustes();
    enlazarAjustes();
    actualizarBotonRevisar();

    const borrador = store.get(KEY_DRAFT, '');
    if (borrador) $('dictado').value = borrador;
    actualizarContador();

    $('dictado').addEventListener('input', () => {
      actualizarContador();
      store.set(KEY_DRAFT, $('dictado').value);
    });
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
    $('btn-actualizar').addEventListener('click', () => { vaciarCola({ silencioso: true }); cargarLista(); });
    $('btn-cerrar-lector').addEventListener('click', () => { $('lector').hidden = true; });
    $('btn-aplicar').addEventListener('click', aplicarRelaciones);
    $('btn-probar-gh').addEventListener('click', probarGitHub);
    $('btn-modelos').addEventListener('click', verModelos);
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.vista === 'capturar' && revision && vistaActual === 'notas') { setVista('revisar'); return; }
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
    }

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* la app funciona igual, solo sin modo sin conexión */ });
    }
  }

  init();
})();
