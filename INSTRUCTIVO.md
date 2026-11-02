# Instructivo: Bóveda (PWA) y proyecto de entrelazamiento en Claude

## 0. Cómo encajan las piezas

```
 Celular (PWA "Bóveda")                GitHub                      Claude
 ──────────────────────       ──────────────────────      ─────────────────────
 dictás → (IA ordena)    ──►  repo PRIVADO de notas  ──►  Proyecto "Entrelazamiento"
 → revisás → guardás           notas/*.md + FORMATO.md     lee la bóveda, propone
                                       ▲                    relaciones, vos confirmás
                                       │                           │
                                       └──── "Aplicar relaciones" ◄┘
                                        (pegás el JSON que te da Claude)
```

Hay **dos repositorios** en GitHub:

| Repositorio | Visibilidad | Qué tiene |
|---|---|---|
| `boveda-app` | Público | El código de la app (open source) |
| `boveda-notas` | **Privado** | Tus notas. Nunca lo hagas público. |

La app y las notas están separadas a propósito: podés compartir o cambiar la app sin exponer una sola nota.

---

## 1. Instalación (una sola vez, unos 30 minutos)

Los nombres de los menús de GitHub cambian de vez en cuando. Si algo no coincide, buscá la opción con nombre parecido.

### 1.1 Cuenta de GitHub
Si no tenés, creala en github.com. Anotá tu nombre de usuario: lo vas a usar en varios pasos.

### 1.2 Repositorio privado de notas
1. En GitHub: **New repository**. Nombre: `boveda-notas`. Visibilidad: **Private**. Tildá "Add a README file" (así la rama `main` queda creada).
2. Descomprimí `boveda-notas-inicial.zip`. Adentro hay una carpeta `notas/` (con 6 notas de la prueba) y `FORMATO.md`.
3. En el repo: **Add file → Upload files**. Arrastrá `notas/` y `FORMATO.md` desde tu compu. **Commit changes**.

### 1.3 Repositorio público de la app
1. **New repository**. Nombre: `boveda-app`. Visibilidad: **Public**.
2. Descomprimí `boveda-app.zip` y subí todo su contenido con **Add file → Upload files** (arrastrá las carpetas `docs`, `tests`, `tools`, `proyecto-claude` y los archivos sueltos). **Commit changes**.
3. **Settings → Pages**. En "Build and deployment": Source = **Deploy from a branch**; Branch = `main`; carpeta = **/docs**. **Save**.
4. Esperá uno o dos minutos. La app queda en `https://TU-USUARIO.github.io/boveda-app/`. Abrila en la compu para confirmar que carga.

> No subas nunca `notas/` al repo público.

### 1.4 Token de GitHub (el permiso que usa la app para escribir)
1. GitHub → tu foto → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nombre: `boveda-celu`. Expiración: la más larga que permita (te va a vencer: ver sección 5).
3. **Repository access → Only select repositories** → elegí solamente `boveda-notas`.
4. **Permissions → Repository permissions → Contents → Read and write.** Nada más.
5. **Generate token** y copiá el valor (`github_pat_…`). Solo se muestra una vez: pegalo en un lugar seguro hasta el paso 1.7.

### 1.5 Clave de IA (opcional)
Sirve para que la app ordene el dictado y sugiera título y tipo. Si no la querés, salteá este paso y desactivá la opción en Ajustes: la app funciona igual.

1. Entrá a **aistudio.google.com** con tu cuenta de Google → **Get API key** → creá una clave.
2. **Qué tenés que saber antes:** en el plan gratuito, Google puede usar lo que enviás para mejorar sus productos, y revisores humanos pueden leerlo. La app envía el dictado completo. Si vas a dictar cosas que no querés que salgan de tu control (recuerdos íntimos, datos de personas), desactivá la IA para esas notas o usá una cuenta con facturación activada, donde esos datos no se usan para mejorar productos.

### 1.6 Instalarla en el celular
- **Android (Chrome):** abrí la dirección de la app → menú ⋮ → **Instalar app** (o **Agregar a la pantalla principal**).
- **iPhone (Safari):** abrí la dirección → botón Compartir → **Agregar a pantalla de inicio**.

### 1.7 Configurarla
Abrí la app **desde el ícono instalado** (importante en iPhone: la app instalada guarda sus datos aparte de Safari, así que configurala ahí, no antes) y andá a **Ajustes**:

1. Usuario: tu usuario de GitHub. Repositorio: `boveda-notas`. Rama: `main`. Carpeta: `notas`. Token: el del paso 1.4.
2. Tocá **Probar conexión**. Tiene que decir "✓ Conectado a … (privado)". Si dice que el repositorio es **público**, frená: estás apuntando al repo equivocado.
3. Si usás IA: pegá la clave, tocá **Ver modelos disponibles** y elegí uno. Si la lista sale vacía o falla, revisá la clave.
4. Andá a **Notas**: deberías ver las 6 notas de la prueba.

Los datos de Ajustes quedan solo en ese dispositivo. Si perdés el celular, revocá el token en GitHub (mismo menú del paso 1.4).

---

## 2. Uso diario de la app

### Capturar
1. Abrí la app (queda en **Capturar**). Tocá el cuadro y dictá con el **micrófono del teclado** del celu. No hay grabación dentro de la app: el dictado del teclado es más confiable en una PWA.
2. Lo que escribís se autoguarda como borrador: si cerrás la app sin querer, vuelve a aparecer.
3. Tocá **Ordenar y revisar** (o **Revisar**, si la IA está desactivada).

### Revisar (el paso que no te saltees)
Antes de guardar, ves cada nota en una tarjeta:

- **Tipo** (idea, lectura, recuerdo) y **título**: editables.
- **Texto**: editable. Es lo que se guarda.
- **Avisos amarillos**: dudas de la IA (una palabra que parece mal transcripta, una frase que se contradice). La IA tiene orden de dejar el texto como lo dijiste y avisar, no de corregirlo por su cuenta.
- **Pregunta en rojo** (por ejemplo, "¿Es tuya o la leíste?"): aparece con frases cortas sin contexto. El tipo queda sin elegir y **no te deja guardar** hasta que lo elijas.
- Si el dictado mezcla cosas (una lectura y una idea propia), puede proponerte **varias notas**. Podés quitar las que no quieras.
- Si la versión ordenada es bastante más larga que lo que dictaste, la app te avisa: puede significar que la IA agregó ideas. Leé con ojo crítico.

Tocá **Guardar**. La app agrega solita el mes y el año de captura al final ("Noviembre 2026") y la fecha completa en el encabezado.

### Si no hay conexión
La nota queda guardada en el celu, con un aviso "N notas sin enviar" y un contador en la pestaña Notas. Se envía sola cuando vuelve la conexión, o tocando **Reintentar**. Mientras no se envíe, la nota existe **solo en ese dispositivo**: no borres los datos del navegador ni desinstales la app.

### Ver la bóveda
La pestaña **Notas** lista las últimas 80 notas (las más recientes primero). Tocá una para leerla. Todavía no hay vista de grafo en la app (ver sección 6).

---

## 3. El proyecto de Claude: entrelazar las notas

Acá es donde las notas se relacionan. Las relaciones (continúa, tensiona, rompe) son interpretaciones tuyas: Claude propone con evidencia y vos decidís.

### 3.1 Crear el proyecto (una vez)
1. En claude.ai → **Projects** → nuevo proyecto. Nombre sugerido: `Entrelazamiento`.
2. Pegá el contenido de `proyecto-claude/instrucciones-del-proyecto.md` en las **instrucciones del proyecto**.
3. En **project knowledge** tocá el botón **+** → **GitHub**. Buscá `boveda-notas` (o pegá su dirección). Como es privado, probablemente te pida autorizar la app de GitHub de Claude para ese repositorio: aceptá y dale acceso solo a `boveda-notas`.
4. En el explorador de archivos, elegí la carpeta `notas` y el archivo `FORMATO.md`.

### 3.2 Antes de cada sesión
Tocá el ícono de **sincronizar** (Sync / "Sync now") junto al repositorio dentro del proyecto. Claude solo ve la última sincronización: si no sincronizás, no ve las notas que capturaste después.

### 3.3 La sesión
1. Abrí un chat nuevo dentro del proyecto. Primer mensaje:
   > Hagamos una sesión de entrelazamiento con las notas pendientes.
2. Claude lista las pendientes y las trabaja de a una. Para cada una propone relaciones con:
   evidencia de ambas notas, confianza y la mejor objeción. Puede proponer **ninguna**.
3. Discutí. Es esperable que te marque cosas: afirmaciones demasiado fuertes, contradicciones entre notas, supuestos sin declarar, lecturas de autores que conviene verificar contra el texto. Si no estás de acuerdo con una relación, decilo y por qué.
4. Cuando cerraste, pedile: **"Dame el bloque para aplicar."** Te devuelve un bloque JSON con **solo lo que confirmaste**.

### 3.4 Aplicar el resultado en la bóveda
1. Copiá el bloque JSON.
2. En la app: **Notas → Aplicar relaciones de Claude** → pegalo → **Aplicar**.
3. La app muestra una línea por nota: ✓ si se actualizó, ✗ con el motivo si no. Solo toca `relaciones` y `estado`; el texto de tus notas no se modifica. Rechaza relaciones que apunten a notas inexistentes y tipos de relación inventados, antes de escribir nada.
4. Volvé a **sincronizar** el proyecto (3.2) para la próxima sesión.

> Hoy Claude **lee** tu bóveda desde el proyecto pero no escribe en ella. Por eso existe el paso 3.4. Más adelante se puede automatizar (ver sección 6).

### 3.5 Cada cuánto
Por acumulación, no por calendario: cuando junten un puñado de pendientes (5 a 10 es un buen número). Las relaciones de tensión y ruptura se ven mejor con varias notas juntas.

---

## 4. Mantenimiento

| Cuándo | Qué hacer |
|---|---|
| Se vence el token | Generá uno nuevo (1.4) y pegalo en Ajustes. Poné un recordatorio en el calendario una semana antes. |
| Perdiste o cambiaste el celu | Revocá el token en GitHub y generá otro. Las notas ya enviadas están a salvo en el repo. |
| La IA deja de andar (modelo inexistente) | Ajustes → **Ver modelos disponibles** → elegí otro. Los modelos gratuitos cambian de nombre con el tiempo. |
| Querés cambiar la app | Editá los archivos de `docs/` en el repo `boveda-app` y hacé commit. La app se actualiza sola (puede requerir abrirla dos veces). |
| Copia de seguridad | El repo `boveda-notas` es tu copia. Podés bajarlo entero desde GitHub: **Code → Download ZIP**. |

---

## 5. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| "GitHub rechazó el token" | Venció, está mal copiado o pertenece a otra cuenta | Generá uno nuevo (1.4) |
| "No encuentro el repositorio, la rama o la carpeta" | Nombre mal escrito, rama distinta a `main`, o el token no incluye ese repo | Revisá Ajustes; el token debe tener acceso a `boveda-notas` |
| "Se agotó la cuota gratuita de la IA" | Límite del plan gratuito | Esperá un rato o tocá **Revisar sin ordenar** |
| "Ese modelo no existe" | Google retiró o renombró el modelo | **Ver modelos disponibles** |
| La nota quedó "sin enviar" | Sin conexión o token inválido | Mirá el mensaje que acompaña al aviso y tocá **Reintentar** |
| "Sin conexión" aunque tengas internet | Red bloqueada o intermitente | Reintentá; la nota sigue guardada en el celu |
| Claude no ve notas recientes | El proyecto no está sincronizado | Sincronizá (3.2) |
| Claude no encuentra el repo privado | Falta autorizar la app de GitHub de Claude para ese repo | Autorizala desde el mismo panel de GitHub del proyecto |

---

## 6. Qué todavía no hace (dicho sin vueltas)

- **No hay grafo ni backlinks dentro de la app.** Es la etapa 2. Mientras tanto, la bóveda es Markdown puro: podés abrir la carpeta en Obsidian u otro editor compatible. No probé cómo muestra Obsidian los enlaces dentro del encabezado; verificalo con tus 6 notas.
- **Claude no escribe solo en la bóveda.** Requiere el paso manual de 3.4. Automatizarlo es posible (otra conexión con permisos de escritura), pero es una decisión aparte porque da a Claude poder de modificar tu repositorio.
- **El audio no se graba dentro de la app.** Se usa el dictado del teclado.
- **La IA gratuita ordena, no entiende:** puede equivocarse. Por eso la revisión es obligatoria y no hay guardado automático.
- **La app se probó con una simulación** de GitHub y Gemini (las 18 comprobaciones de interfaz y las 16 pruebas de lógica pasan), **pero todavía no en un teléfono real ni contra los servicios reales.** El primer uso en tu celu es la prueba definitiva: si algo falla, copiá el mensaje exacto y lo corregimos.
- **Las definiciones de las relaciones** (`FORMATO.md`) son una propuesta mía. Editalas hasta que digan lo que vos querés decir.

---

## 7. Primera semana sugerida

1. Instalá todo (sección 1) y probá con 2 o 3 notas reales.
2. Usala 5 a 7 días capturando en momentos reales (no "para la prueba"), como lo hacés con el celu.
3. Hacé la primera sesión de entrelazamiento (sección 3) con las notas de la prueba más las nuevas. De las 6 de la prueba, 4 están pendientes y 2 de ellas ya tienen una relación propuesta para conversar (las caminatas con Kleist, y "el ensayo habilita el error" con "el mejor ensayo emula el habla").
4. Volvé acá con lo que no funcionó, lo que sobró y lo que faltó. Con eso se decide la etapa 2 (grafo) y si vale la pena automatizar la escritura de Claude.
