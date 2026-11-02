'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../docs/core.js');

test('fechaISO usa la fecha local, no UTC (23:30 en Argentina sigue siendo el mismo día)', () => {
  const d = new Date(2026, 10, 2, 23, 30); // 2 nov 2026, 23:30 hora local
  assert.equal(C.fechaISO(d), '2026-11-02');
  assert.equal(C.mesAnio(d), 'Noviembre 2026');
});

test('slugify: tildes, ñ, signos y vacío', () => {
  assert.equal(C.slugify('Kleist: el pensamiento se fabrica al hablar'), 'kleist-el-pensamiento-se-fabrica-al-hablar');
  assert.equal(C.slugify('¿Año nuevo? ¡Sí!'), 'ano-nuevo-si');
  assert.equal(C.slugify('???'), 'nota');
  assert.ok(C.slugify('a'.repeat(200)).length <= 60);
});

test('nombreArchivo lleva fecha + slug', () => {
  assert.equal(C.nombreArchivo('Las caminatas motorizan ideas', new Date(2026, 9, 30)),
    '2026-10-30-las-caminatas-motorizan-ideas.md');
});

test('construirNota: encabezado, título, cuerpo y mes/año al final', () => {
  const md = C.construirNota({ tipo: 'idea', titulo: '# El mejor ensayo emula el habla', texto: 'Primera línea.\r\n\r\n\r\n\r\nSegunda.' },
    new Date(2026, 9, 30));
  assert.equal(md, [
    '---', 'tipo: idea', 'estado: pendiente', 'fecha: 2026-10-30', 'relaciones: []', '---',
    '# El mejor ensayo emula el habla', '', 'Primera línea.\n\nSegunda.', '', 'Octubre 2026', '',
  ].join('\n'));
});

test('construirNota rechaza tipo inválido y nota vacía', () => {
  assert.throws(() => C.construirNota({ tipo: '', titulo: 'x', texto: 'y' }));
  assert.throws(() => C.construirNota({ tipo: 'idea', titulo: 'x', texto: '   ' }));
});

test('base64 UTF-8 ida y vuelta (tildes, ñ, emoji, texto largo)', () => {
  const s = 'Año, él, "ñandú", São Paulo ✓ 🚶 ' + 'á'.repeat(70000);
  assert.equal(C.base64ToUtf8(C.utf8ToBase64(s)), s);
  assert.equal(C.utf8ToBase64('hola'), Buffer.from('hola').toString('base64'));
  assert.equal(C.utf8ToBase64('Año'), Buffer.from('Año', 'utf8').toString('base64'));
});

test('leerFrontmatter lee tipo, estado, fecha y relaciones', () => {
  const md = '---\ntipo: idea\nestado: trabajada\nfecha: 2026-10-29\nrelaciones:\n  - continua: "[[2026-10-29-kleist]]"\n  - tensiona: "[[otra]]"\n---\n# T\n\ncuerpo\n';
  assert.deepEqual(C.leerFrontmatter(md), {
    tipo: 'idea', estado: 'trabajada', fecha: '2026-10-29',
    relaciones: [{ tipo: 'continua', con: '2026-10-29-kleist' }, { tipo: 'tensiona', con: 'otra' }],
  });
  assert.deepEqual(C.leerFrontmatter('sin encabezado').relaciones, []);
});

test('aplicarActualizacion: agrega relación y cambia estado sin tocar el resto', () => {
  const md = C.construirNota({ tipo: 'idea', titulo: 'T', texto: 'cuerpo' }, new Date(2026, 9, 30));
  const out = C.aplicarActualizacion(md, { estado: 'trabajada', relaciones: [{ tipo: 'continua', con: '[[2026-10-29-kleist.md]]' }] });
  assert.match(out, /estado: trabajada/);
  assert.match(out, /relaciones:\n  - continua: "\[\[2026-10-29-kleist\]\]"\n---/);
  assert.ok(out.endsWith(md.slice(md.indexOf('# T'))), 'el cuerpo queda idéntico');
  assert.deepEqual(C.leerFrontmatter(out).relaciones, [{ tipo: 'continua', con: '2026-10-29-kleist' }]);
});

test('aplicarActualizacion: no duplica y acumula relaciones distintas', () => {
  let md = C.construirNota({ tipo: 'idea', titulo: 'T', texto: 'cuerpo' }, new Date(2026, 9, 30));
  md = C.aplicarActualizacion(md, { relaciones: [{ tipo: 'continua', con: 'a' }] });
  md = C.aplicarActualizacion(md, { relaciones: [{ tipo: 'continua', con: 'a' }, { tipo: 'tensiona', con: 'b' }] });
  assert.deepEqual(C.leerFrontmatter(md).relaciones, [{ tipo: 'continua', con: 'a' }, { tipo: 'tensiona', con: 'b' }]);
  assert.equal(C.leerFrontmatter(md).estado, 'pendiente', 'sin estado nuevo, no lo cambia');
});

test('aplicarActualizacion: errores claros', () => {
  const md = C.construirNota({ tipo: 'idea', titulo: 'T', texto: 'c' }, new Date(2026, 9, 30));
  assert.throws(() => C.aplicarActualizacion(md, { relaciones: [{ tipo: 'amiga', con: 'a' }] }), /Tipo de relación/);
  assert.throws(() => C.aplicarActualizacion(md, { estado: 'hecha' }), /Estado inválido/);
  assert.throws(() => C.aplicarActualizacion('sin encabezado', { estado: 'trabajada' }), /encabezado/);
});

test('validarActualizaciones acepta el formato de Claude y rechaza lo raro', () => {
  const ok = C.validarActualizaciones({ actualizaciones: [
    { nota: 'a', estado: 'trabajada', relaciones: [{ tipo: 'continua', con: '[[b]]' }] },
    { nota: 'c' },
  ] });
  assert.deepEqual(ok[0], { nota: 'a', estado: 'trabajada', relaciones: [{ tipo: 'continua', con: 'b' }] });
  assert.deepEqual(ok[1], { nota: 'c', estado: null, relaciones: [] });
  assert.throws(() => C.validarActualizaciones({}), /actualizaciones/);
  assert.throws(() => C.validarActualizaciones({ actualizaciones: [{ nota: 'a', relaciones: [{ tipo: 'continua', con: 'a' }] }] }), /consigo misma/);
  assert.throws(() => C.validarActualizaciones({ actualizaciones: [{ nota: 'a', relaciones: [{ tipo: 'x', con: 'b' }] }] }), /tipo de relación/);
});

test('extraerJSON tolera bloques de código y texto alrededor', () => {
  assert.deepEqual(C.extraerJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(C.extraerJSON('Acá va: {"a":1} listo'), { a: 1 });
  assert.throws(() => C.extraerJSON('nada'));
});

test('normalizarRespuestaIA: tipo vacío si hay pregunta, título provisorio, tope de 4', () => {
  const dictado = 'uno está hecho de los afectos';
  const r = C.normalizarRespuestaIA({ notas: [
    { tipo: 'idea', titulo: '', texto: 'Uno está hecho de los afectos.', pregunta_tipo: '¿Es tuya o la leíste?', avisos: [] },
  ] }, dictado);
  assert.equal(r.notas[0].tipo, '');
  assert.equal(r.notas[0].tipoSugerido, 'idea');
  assert.equal(r.notas[0].pregunta, '¿Es tuya o la leíste?');
  assert.equal(r.notas[0].titulo, 'Uno está hecho de los afectos');

  const muchas = { notas: Array.from({ length: 9 }, (_, i) => ({ tipo: 'idea', titulo: 't' + i, texto: 'x' + i })) };
  assert.equal(C.normalizarRespuestaIA(muchas, 'x').notas.length, 4);
  assert.throws(() => C.normalizarRespuestaIA({ notas: [] }, 'x'));
  assert.throws(() => C.normalizarRespuestaIA({ notas: [{ tipo: 'idea', texto: '  ' }] }, 'x'));
});

test('normalizarRespuestaIA avisa cuando la IA agrega o pierde mucho texto', () => {
  const dictado = 'palabra '.repeat(40).trim();
  const larga = C.normalizarRespuestaIA({ notas: [{ tipo: 'idea', titulo: 't', texto: 'palabra '.repeat(80) }] }, dictado);
  assert.equal(larga.avisosGlobales.length, 1);
  assert.match(larga.avisosGlobales[0], /más larga/);
  const corta = C.normalizarRespuestaIA({ notas: [{ tipo: 'idea', titulo: 't', texto: 'palabra '.repeat(5) }] }, dictado);
  assert.match(corta.avisosGlobales[0], /más corta/);
  const bien = C.normalizarRespuestaIA({ notas: [{ tipo: 'idea', titulo: 't', texto: 'palabra '.repeat(35) }] }, dictado);
  assert.deepEqual(bien.avisosGlobales, []);
});

test('notaDesdeDictado arma una nota sin IA con tipo a elegir', () => {
  const r = C.notaDesdeDictado('  Caminar produce ideas porque la idea es un movimiento.  ');
  assert.equal(r.notas[0].tipo, '');
  assert.equal(r.notas[0].titulo, 'Caminar produce ideas porque la idea es');
  assert.equal(r.notas[0].texto, 'Caminar produce ideas porque la idea es un movimiento.');
});

test('el prompt contiene las reglas que protegen el contenido', () => {
  const p = C.promptSistema();
  for (const frag of ['No agregues ideas', 'voseo', 'MATERIAL A ORDENAR', 'pregunta_tipo', 'Nunca elimines']) {
    assert.ok(p.includes(frag), 'falta: ' + frag);
  }
});
