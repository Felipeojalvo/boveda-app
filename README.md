# Bóveda

Aplicación web instalable (PWA) de código abierto para capturar notas por dictado en el celular y guardarlas como archivos Markdown en un repositorio de GitHub. Pensada para trabajar esas notas después con Claude: tres tipos de nota (idea, lectura, recuerdo) y tres tipos de relación entre notas (continúa, tensiona, rompe).

- Sin servidor propio, sin base de datos, sin dependencias: HTML, CSS y JavaScript.
- Tus notas son archivos `.md` en **tu** repositorio. La app no es dueña de nada.
- Una nota nunca se pierde: se guarda primero en el dispositivo y después se envía.

## Estructura

| Carpeta | Contenido |
|---|---|
| `docs/` | La app (lo que se publica con GitHub Pages) |
| `tests/` | Pruebas de la lógica de notas (`node --test tests/core.test.js`) |
| `tools/` | Generador de íconos |
| `proyecto-claude/` | Instrucciones del proyecto de Claude donde se entrelazan las notas |

El formato de las notas está definido en `FORMATO.md`, que vive en el repositorio de notas (no en este).

## Cómo se usa

Mirá `INSTRUCTIVO.md`.

## Privacidad

La clave de GitHub y la de la IA se guardan solo en el navegador del dispositivo. Si activás el orden con IA, el dictado se envía al servicio de IA que elijas; en el plan gratuito de Gemini, Google puede usar esos datos para mejorar sus productos. Podés desactivar la IA y la app funciona igual.

## Licencia

MIT.
