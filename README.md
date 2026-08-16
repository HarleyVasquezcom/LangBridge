# LangBridge

**phrase-to-phrase, page-to-page** — a tiny Chrome (MV3) extension with a built-in tri-lingual dictionary (about 200 terms) that translates:

- **words under your cursor** — click a word on a page to get its translation in a small tooltip,
- **whole phrases** — type a phrase in the popup, get a word-by-word translation,
- **the page itself** — click the floating **LB** button (or "Translate page" in the popup) to replace every known word of the page; click again to restore the original text.

Everything runs locally in `chrome.storage.local` — no network calls, no accounts, nothing is sent anywhere.

## What it does

- ~200 common terms in **EN, ES and FR** (EN ↔ ES and EN ↔ FR direct; **ES ↔ FR runs through the English pivot**).
- Case-insensitive lookups; out-of-dictionary words are honestly reported ("not in the built-in dictionary").
- Phrases keep unknown words untouched and tell you how many were missing.
- The content script only activates on pages you open from a **local dev server (`http://127.0.0.1`)** — you can extend the match patterns in `manifest.json` if you want it on other sites.
- Interface (popup and landing page) in 6 languages: EN, ES, FR, PT, IT, DE — picker persists.

## Permissions — minimal and used

- **storage** — the UI language, the from/to pair and nothing else live in `chrome.storage.local`.
- No host permissions, no tabs permission, no background service worker, no network: the dictionary and the UI are fully embedded.

## Honest limits

- The dictionary is **a toy vocabulary, not a real translator**: about 200 common terms, so most real text will be partially translated. Words outside the dictionary are left as they are and reported.
- Homographs (e.g. Spanish *mañana* = morning/tomorrow) resolve to the first entry.
- The full-page translate replaces **known words only**, and keeps unknown words exactly as they were.

## Install (unpacked)

1. Download `langbridge.zip` from the landing page and unpack it somewhere permanent.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **“Load unpacked”** and pick the folder (keep the folder after loading).
4. Open a local page (or the fixture in `tests/fixtures/`), click a word, type a phrase, or hit the **LB** button.

## Verify (headless probe)

The hermetic probe launches real Chrome (headless), serves a local fixture page, loads the extension, and verifies the dictionary, tooltips, page translation, the 6-language UI loop, defaults after wiping storage, and the ZIP/landing byte-identity.

```bash
npm install
npm run zip
npm run probe
```

- `probe` needs a Chrome binary: it uses Puppeteer's bundled Chrome, or the `PROBE_CHROME` env var.
- With `LANGBRIDGE_DEPLOY_URL` set, the probe also checks the deployed landing page (same command, no extra steps).
- `zip` produces `dist/langbridge.zip` and the byte-identical copy next to the landing page.

Built by [Harley Vásquez](https://www.linkedin.com/in/harleyvasquez/) — no third-party brands, no tracking, no telemetry.

Landing page: `https://langbridge.vercel.app`

---

# LangBridge (ES)

**De frase a frase, de página a página** — una pequeña extensión de Chrome (MV3) con un diccionario trilingüe integrado (~200 términos) que traduce:

- **palabras bajo el cursor** — haz clic en una palabra de una página para ver su traducción en un pequeño tooltip,
- **frases completas** — escribe una frase en el popup y obtén una traducción palabra por palabra,
- **la propia página** — pulsa el botón flotante **LB** (o "Traducir página" en el popup) para reemplazar todas las palabras conocidas de la página; pulsa de nuevo para restaurar el texto original.

Todo funciona localmente en `chrome.storage.local` — sin llamadas de red, sin cuentas, nada se envía a ningún sitio.

## Qué hace

- ~200 términos comunes en **EN, ES y FR** (EN ↔ ES y EN ↔ FR directos; **ES ↔ FR pasa por el pivote inglés**).
- Búsquedas insensibles a mayúsculas; las palabras fuera del diccionario se reportan honestamente ("no está en el diccionario integrado").
- Las frases conservan las palabras desconocidas y te dicen cuántas faltaron.
- El content script solo se activa en páginas servidas desde un **servidor local (`http://127.0.0.1`)** — puedes ampliar los matches en `manifest.json` si quieres usarlo en otros sitios.
- Interfaz (popup y página de aterrizaje) en 6 idiomas: EN, ES, FR, PT, IT, DE — el selector persiste.

## Permisos — mínimos y usados

- **storage** — el idioma de la interfaz y el par desde/hacia viven en `chrome.storage.local`. Nada más.
- Sin permisos de host, sin permiso de pestañas, sin service worker de fondo, sin red: el diccionario y la interfaz están totalmente integrados.

## Límites honestos

- El diccionario es **un vocabulario de juguete, no un traductor real**: unas 200 palabras comunes, así que la mayor parte del texto real quedará solo parcialmente traducido. Las palabras fuera del diccionario se quedan como están y se reportan.
- Los homógrafos (p. ej. *mañana* = morning/tomorrow) resuelven a la primera entrada.
- La traducción de página reemplaza **solo palabras conocidas** y deja las desconocidas exactamente como estaban.

## Instalación (descomprimida)

1. Descarga `langbridge.zip` desde la página de aterrizaje y descomprímelo en un lugar permanente.
2. Abre `chrome://extensions` y activa el **modo desarrollador**.
3. Haz clic en **"Cargar descomprimida"** y elige la carpeta (consérvala después de cargarla).
4. Abre una página local (o el fixture en `tests/fixtures/`), haz clic en una palabra, escribe una frase o pulsa el botón **LB**.

## Verificación (probe headless)

El probe hermético lanza Chrome real (headless), sirve una página fixture local, carga la extensión y verifica el diccionario, los tooltips, la traducción de página, el bucle de interfaz en 6 idiomas, los valores por defecto tras borrar el almacenamiento y la identidad de bytes del ZIP/landing.

```bash
npm install
npm run zip
npm run probe
```

- `probe` necesita un binario de Chrome: usa el Chrome empaquetado de Puppeteer, o la variable `PROBE_CHROME`.
- Con `LANGBRIDGE_DEPLOY_URL` definida, el probe también comprueba la página de aterrizaje desplegada (mismo comando, sin pasos extra).
- `zip` produce `dist/langbridge.zip` y la copia byte-idéntica junto a la página de aterrizaje.

Creado por [Harley Vásquez](https://www.linkedin.com/in/harleyvasquez/) — sin marcas de terceros, sin rastreo, sin telemetría.
