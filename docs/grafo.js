/* Bóveda — dibujo del grafo en SVG, con desplazamiento, zoom (pellizco y rueda) y selección. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const truncar = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const anchoPill = (n) => Math.max(36, n.label.length * 7.4 + 20);

  function forma(tipo) {
    const r = 9;
    if (tipo === 'lectura') return el('rect', { class: 'forma', x: -r, y: -r, width: r * 2, height: r * 2 });
    if (tipo === 'recuerdo') {
      return el('polygon', { class: 'forma', points: `0,${-r * 1.15} ${r * 1.1},${r * 0.85} ${-r * 1.1},${r * 0.85}` });
    }
    return el('circle', { class: 'forma', r });
  }

  // grafo = { nodes:[{id,kind,label,tipo,estado,x,y}], edges:[{a,b,kind}] } con posiciones ya calculadas.
  function montar(cont, grafo, opc) {
    cont.textContent = '';
    const alSeleccionar = (opc && opc.alSeleccionar) || function () {};
    const { nodes, edges } = grafo;
    const porId = new Map(nodes.map((n) => [n.id, n]));

    const svg = el('svg', { class: 'grafo-svg', role: 'img', 'aria-label': 'Grafo de notas y temas' });
    const defs = el('defs');
    for (const k of ['continua', 'rompe']) {
      const m = el('marker', { id: 'punta-' + k, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto' });
      m.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'punta-' + k }));
      defs.appendChild(m);
    }
    svg.appendChild(defs);
    const vp = el('g');
    const gAristas = el('g');
    const gNodos = el('g');
    vp.append(gAristas, gNodos);
    svg.appendChild(vp);

    // Aristas (se acortan en el borde de la nota de destino para que la flecha se vea)
    const aristas = [];
    for (const e of edges) {
      const a = porId.get(e.a);
      const b = porId.get(e.b);
      if (!a || !b) continue;
      let x2 = b.x;
      let y2 = b.y;
      if (e.kind === 'continua' || e.kind === 'rompe') {
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        x2 = b.x - ((b.x - a.x) / d) * 14;
        y2 = b.y - ((b.y - a.y) / d) * 14;
      }
      const attrs = { class: 'arista ' + e.kind, x1: a.x, y1: a.y, x2, y2 };
      if (e.kind === 'continua' || e.kind === 'rompe') attrs['marker-end'] = `url(#punta-${e.kind})`;
      const ln = el('line', attrs);
      gAristas.appendChild(ln);
      aristas.push({ e, el: ln });
    }

    // Nodos
    const nodoEl = new Map();
    for (const n of nodes) {
      const g = el('g', { 'data-id': n.id, transform: `translate(${n.x} ${n.y})` });
      if (n.kind === 'tema') {
        g.setAttribute('class', 'nodo tema');
        const w = anchoPill(n);
        g.appendChild(el('rect', { class: 'pill', x: -w / 2, y: -11, width: w, height: 22, rx: 3 }));
        const t = el('text', { class: 'rotulo', x: 0, y: 0 });
        t.textContent = n.label;
        g.appendChild(t);
      } else {
        g.setAttribute('class', `nodo nota ${n.estado === 'trabajada' ? 'trabajada' : 'pendiente'} t-${n.tipo}`);
        g.appendChild(el('circle', { r: 20, fill: 'transparent' })); // zona táctil más grande
        g.appendChild(forma(n.tipo));
        const t = el('text', { class: 'rotulo', x: 0, y: 24 });
        t.textContent = truncar(n.label, 22);
        g.appendChild(t);
      }
      gNodos.appendChild(g);
      nodoEl.set(n.id, g);
    }
    cont.appendChild(svg);

    // ---- Cámara ----
    const st = { x: 0, y: 0, k: 1 };
    const dims = () => {
      const r = svg.getBoundingClientRect();
      return { w: r.width || 360, h: r.height || 420 };
    };
    function aplicar() {
      vp.setAttribute('transform', `translate(${st.x} ${st.y}) scale(${st.k})`);
      svg.classList.toggle('zoom-bajo', st.k < 0.5);
    }
    function zoomEn(px, py, f) {
      const nk = clamp(st.k * f, 0.12, 6);
      const r = nk / st.k;
      st.x = px - (px - st.x) * r;
      st.y = py - (py - st.y) * r;
      st.k = nk;
      aplicar();
    }
    function ajustar() {
      const { w, h } = dims();
      if (!nodes.length) { st.x = w / 2; st.y = h / 2; st.k = 1; aplicar(); return; }
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const n of nodes) {
        const hw = n.kind === 'tema' ? anchoPill(n) / 2 : 40;
        x0 = Math.min(x0, n.x - hw); x1 = Math.max(x1, n.x + hw);
        y0 = Math.min(y0, n.y - 16); y1 = Math.max(y1, n.y + 32);
      }
      const bw = Math.max(x1 - x0, 60);
      const bh = Math.max(y1 - y0, 60);
      const pad = 16;
      const k = clamp(Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh), 0.12, 1.6);
      st.k = k;
      st.x = w / 2 - ((x0 + x1) / 2) * k;
      st.y = h / 2 - ((y0 + y1) / 2) * k;
      aplicar();
    }

    // ---- Selección ----
    function seleccionar(id) {
      const vecinos = new Set();
      if (id) {
        vecinos.add(id);
        for (const a of aristas) {
          if (a.e.a === id) vecinos.add(a.e.b);
          else if (a.e.b === id) vecinos.add(a.e.a);
        }
      }
      for (const [nid, g] of nodoEl) {
        g.classList.toggle('sel', nid === id);
        g.classList.toggle('opaco', Boolean(id) && !vecinos.has(nid));
      }
      for (const a of aristas) {
        const act = Boolean(id) && (a.e.a === id || a.e.b === id);
        a.el.classList.toggle('activa', act);
        a.el.classList.toggle('opaco', Boolean(id) && !act);
      }
    }

    // ---- Gestos: un dedo desplaza, dos dedos hacen zoom, un toque selecciona ----
    const punteros = new Map();
    let movido = false;
    let nodoDown = null;
    let inicio = { x: 0, y: 0 };
    let previo = null;

    svg.addEventListener('pointerdown', (e) => {
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* no crítico */ }
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 1) {
        movido = false;
        nodoDown = e.target && e.target.closest ? e.target.closest('.nodo') : null;
        inicio = { x: e.clientX, y: e.clientY };
      } else {
        movido = true;
        nodoDown = null;
        previo = null;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      const p = punteros.get(e.pointerId);
      if (!p) return;
      if (punteros.size === 1) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (!movido && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 6) movido = true;
        if (movido) { st.x += dx; st.y += dy; aplicar(); }
        p.x = e.clientX; p.y = e.clientY;
      } else if (punteros.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...punteros.values()];
        const r = svg.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const cx = (a.x + b.x) / 2 - r.left;
        const cy = (a.y + b.y) / 2 - r.top;
        if (previo) {
          zoomEn(cx, cy, dist / previo.dist);
          st.x += cx - previo.cx;
          st.y += cy - previo.cy;
          aplicar();
        }
        previo = { dist, cx, cy };
      }
    });
    function soltar(e) {
      if (!punteros.delete(e.pointerId)) return;
      previo = null;
      if (punteros.size > 0) return;
      if (!movido && e.type === 'pointerup') {
        const id = nodoDown ? nodoDown.getAttribute('data-id') : null;
        seleccionar(id);
        alSeleccionar(id ? porId.get(id) : null);
      }
      nodoDown = null;
    }
    svg.addEventListener('pointerup', soltar);
    svg.addEventListener('pointercancel', soltar);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomEn(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    ajustar();
    // Si el contenedor todavía no tenía tamaño al montar, reajusta apenas lo tenga.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(ajustar);

    return {
      ajustar,
      zoom(f) { const { w, h } = dims(); zoomEn(w / 2, h / 2, f); },
      seleccionar,
      camara: () => ({ x: st.x, y: st.y, k: st.k }),
      destruir() { cont.textContent = ''; },
    };
  }

  root.Grafo = { montar };
})(typeof window !== 'undefined' ? window : globalThis);
