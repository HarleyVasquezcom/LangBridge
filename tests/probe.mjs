import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

let puppeteer;
try {
  puppeteer = createRequire(import.meta.url)('puppeteer');
} catch (e) {
  console.error('puppeteer not installed — run `npm install` first');
  process.exit(2);
}
let CHROME;
try {
  CHROME = process.env.PROBE_CHROME || (await puppeteer.executablePath());
} catch (e) {
  CHROME = process.env.PROBE_CHROME;
}

const DEPLOY_URL = (process.env.LANGBRIDGE_DEPLOY_URL || '').replace(/\/+$/, '');
const EXT = path.resolve(import.meta.dirname, '..');
const EXT_FWD = EXT.replaceAll('\\', '/');
const FIXTURE = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'site.html'), 'utf8');

const EXPECTED_LABELS = {
  tagline: {
    en: 'phrase-to-phrase, page-to-page', es: 'de frase a frase, de página a página', fr: 'de phrase en phrase, de page en page',
    pt: 'de frase a frase, de página a página', it: 'di frase in frase, di pagina in pagina', de: 'von Satz zu Satz, von Seite zu Seite',
  },
  pageTranslate: {
    en: 'Translate page (current tab)', es: 'Traducir página (pestaña actual)', fr: 'Traduire la page (onglet actuel)',
    pt: 'Traduzir página (aba atual)', it: 'Traduci pagina (scheda attuale)', de: 'Seite übersetzen (aktueller Tab)',
  },
  noEntry: {
    en: 'Not in the built-in dictionary — nothing to show.', es: 'No está en el diccionario integrado — no hay nada que mostrar.',
    fr: 'Introuvable dans le dictionnaire intégré — rien à afficher.', pt: 'Não está no dicionário integrado — nada para mostrar.',
    it: 'Non è nel dizionario integrato — niente da mostrare.', de: 'Nicht im integrierten Wörterbuch — nichts anzuzeigen.',
  },
  credit: {
    en: 'Built by Harley Vásquez', es: 'Creado por Harley Vásquez', fr: 'Créé par Harley Vásquez',
    pt: 'Criado por Harley Vásquez', it: 'Creato da Harley Vásquez', de: 'Erstellt von Harley Vásquez',
  },
  fromL: {
    en: 'From', es: 'De', fr: 'De', pt: 'De', it: 'Da', de: 'Von',
  },
  translate: {
    en: 'Translate', es: 'Traducir', fr: 'Traduire', pt: 'Traduzir', it: 'Traduci', de: 'Übersetzen',
  },
};

let passes = 0;
let failures = 0;
const problems = [];
const check = (name, ok, detail = '') => {
  if (ok) {
    passes++;
    console.log('  PASS ' + name);
  } else {
    failures++;
    problems.push(name + (detail ? ' — ' + detail : ''));
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, timeout = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      /* retry */
    }
    await sleep(150);
  }
  return null;
};
const getAll = async (popup) => (await popup.evaluate(() => chrome.storage.local.get(null)));
const safeClose = (p) => {
  if (p && !p.isClosed()) p.close().catch(() => {});
};

console.log('LangBridge probe (extension: ' + EXT + ')');

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://localhost').pathname;
  if (p === '/site.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FIXTURE);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const SITE_PAGE = 'http://127.0.0.1:' + PORT + '/site.html';

// ---------- BASELINE (hermetic / manifest) ----------
console.log('baseline');
{
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  check('manifest_version 3', m.manifest_version === 3, JSON.stringify(m.manifest_version));
  check('minimal permissions (storage only)', JSON.stringify([...(m.permissions || [])].sort()) === JSON.stringify(['storage']), JSON.stringify(m.permissions));
  check('no host_permissions', !m.host_permissions, JSON.stringify(m.host_permissions || []));
  check('no background SW', !m.background, JSON.stringify(m.background || null));
  check('content script matches only local fixture host', JSON.stringify(m.content_scripts[0].matches) === JSON.stringify(['http://127.0.0.1/*']), JSON.stringify(m.content_scripts[0].matches));
  check('action popup present', !!m.action && m.action.default_popup === 'popup.html');
}

// ---------- PREFLIGHT (manifest files exist + popup loads) ----------
console.log('preflight');
const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-extensions-except=' + EXT_FWD, '--load-extension=' + EXT_FWD],
});
let currentUrl = null;
let popup = null;
let page = null;
let extId = null;
let popupErrors = [];
let pageErrors = [];
try {
  {
    const i18nRaw = fs.readFileSync(path.join(EXT, 'i18n.js'), 'utf8');
    check('i18n has 6 languages', ['en', 'es', 'fr', 'pt', 'it', 'de'].every((l) => i18nRaw.includes(l + ': {')), '');
    check('landing index exists', fs.existsSync(path.join(EXT, 'landing', 'index.html')));
    for (const n of ['icon16.png', 'icon48.png', 'icon128.png']) {
      const pth = path.join(EXT, 'icons', n);
      check('icon ' + n + ' exists', fs.existsSync(pth) && fs.statSync(pth).size > 0, '');
    }
    const zipPkg = fs.readFileSync(path.join(EXT, 'package.json'), 'utf8');
    check('package.json has archiver + puppeteer', zipPkg.includes('archiver') && zipPkg.includes('puppeteer'), '');
  }

  await browser.userAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');

  // ---------- EXTENSION REGISTERED ----------
  const reg = await browser.newPage();
  await reg.goto('chrome://extensions-internals', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  const data = JSON.parse(await reg.evaluate(() => document.body.innerText));
  const entry = data.find((e) => e.name === 'LangBridge');
  check('extension registered and ENABLED', !!entry && entry.registry_status === 'ENABLED' && entry.location === 'COMMAND_LINE', entry ? entry.registry_status : 'not found');
  check('manifest_version 3 confirmed by Chrome', entry ? entry.manifest_version === 3 : false, '');
  if (!entry) throw new Error('LangBridge extension not found');
  extId = entry.id;
  currentUrl = `chrome-extension://${extId}/popup.html`;
  await reg.close();

  // ---------- POPUP ----------
  popupErrors = [];
  popup = await browser.newPage();
  popup.on('pageerror', (err) => popupErrors.push('page:' + err.message));
  popup.on('console', (msg) => {
    if (msg.type() === 'error') popupErrors.push('console:' + msg.text());
  });
  await popup.goto(currentUrl, { waitUntil: 'load' });
  await sleep(600);

  // ---------- FIXTURE PAGE (active) ----------
  pageErrors = [];
  page = await browser.newPage();
  page.on('pageerror', (err) => pageErrors.push('page:' + err.message + ' @ ' + String(err.stack || '').split('\n')[1]));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push('console:' + msg.text());
  });
  await page.goto(SITE_PAGE, { waitUntil: 'load' });
  await page.bringToFront();
  await sleep(600);

  // ---------- DICT CORRECTNESS ----------
  console.log('dictionary');
  {
    const info = await popup.evaluate(() => ({
      size: window.__lbDictSize(),
      house_es: window.__lbTranslate('house', 'en', 'es'),
      agua_en: window.__lbTranslate('agua', 'es', 'en'),
      eau_fr: window.__lbTranslate('eau', 'fr', 'en'),
      casa_fr: window.__lbTranslate('casa', 'es', 'fr'),
      maison_es: window.__lbTranslate('maison', 'fr', 'es'),
      unknown: window.__lbTranslate('floop', 'en', 'es'),
      case_insensitive: window.__lbTranslate('HoUsE', 'en', 'es'),
    }));
    check('built-in dictionary has about 200 terms', info.size >= 190, 'size=' + info.size);
    check('en→es direct lookup', info.house_es === 'casa', info.house_es);
    check('es→en reverse lookup (inversion)', info.agua_en === 'water', info.agua_en);
    check('fr→en reverse lookup (inversion)', info.eau_fr === 'water', info.eau_fr);
    check('es→fr via english pivot', info.casa_fr === 'maison', info.casa_fr);
    check('fr→es via english pivot', info.maison_es === 'casa', info.maison_es);
    check('out-of-dict returns null (honest)', info.unknown === null, String(info.unknown));
    check('lookup is case-insensitive', info.case_insensitive === 'casa', info.case_insensitive);
  }

  // ---------- PHRASE (popup) ----------
  console.log('phrase');
  {
    const r = await popup.evaluate(() => window.__lbPhrase('hello world', 'en', 'es'));
    check('phrase translates known words', r.out === 'hola mundo', r.out);
    check('phrase reports zero missing', r.missing === 0, String(r.missing));
    const r2 = await popup.evaluate(() => window.__lbPhrase('hello floop', 'en', 'es'));
    check('phrase keeps unknown words (honest)', r2.missing === 1 && r2.out.includes('floop'), r2.out);
  }

  // ---------- TOOLTIP (content script) ----------
  console.log('tooltip');
  {
    await popup.evaluate(() => chrome.storage.local.set({ 'lb:from': 'en', 'lb:to': 'es' }));
    await page.click('#w1').catch(() => {});
    await sleep(300);
    const tip1 = await waitFor(() => page.evaluate(() => {
      const t = document.querySelector('[data-lb-tip]');
      return t ? t.textContent : null;
    }));
    check('clicking a fixture word shows the tooltip', typeof tip1 === 'string' && tip1.includes('casa'), String(tip1));
    await page.evaluate(() => document.querySelector('[data-lb-tip]')?.remove());
    await sleep(200);
    await popup.evaluate(() => chrome.storage.local.set({ 'lb:from': 'es', 'lb:to': 'fr' }));
    await page.click('#w3').catch(() => {});
    await sleep(300);
    const tip2 = await waitFor(() => page.evaluate(() => {
      const t = document.querySelector('[data-lb-tip]');
      return t ? t.textContent : null;
    }));
    check('tooltip follows persisted pair (pivot es→fr)', typeof tip2 === 'string' && tip2.includes('maison'), String(tip2));
    await page.evaluate(() => document.querySelector('[data-lb-tip]')?.remove());
    await sleep(150);
  }

  // ---------- PAGE TRANSLATE (content script) ----------
  console.log('page translate');
  {
    const pre = await page.evaluate(() => document.getElementById('p1').textContent.trim());
    check('fixture starts in english', pre.includes('dog') && pre.includes('cat'), pre);
    await popup.evaluate(() => chrome.storage.local.set({ 'lb:from': 'en', 'lb:to': 'es' }));
    await page.evaluate(() => document.querySelector('[data-lb-pill]')?.click());
    await sleep(400);
    const after = await page.evaluate(() => ({
      h1: document.getElementById('h1').textContent.trim(),
      p1: document.getElementById('p1').textContent.trim(),
      unknown: document.getElementById('unknown').textContent.trim(),
    }));
    check('known words replaced on the page', after.p1.includes('perro') && after.p1.includes('gato'), after.p1);
    check('page title area replaced too', after.h1.includes('casa') && after.h1.includes('agua'), after.h1);
    check('unknown words stay untouched (honest)', after.unknown.includes('floop') && after.unknown.includes('zorvik'), after.unknown);
    await page.evaluate(() => document.querySelector('[data-lb-pill]')?.click());
    await sleep(400);
    const back = await page.evaluate(() => document.getElementById('p1').textContent.trim());
    check('second click restores the original text', back.includes('dog') && back.includes('cat'), back);
  }

  // ---------- I18N LOOP (all dynamic text, per language) ----------
  console.log('i18n loop');
  {
    const langs = ['en', 'es', 'fr', 'pt', 'it', 'de'];
    for (const code of langs) {
      await popup.evaluate((c) => chrome.storage.local.set({ 'lb:lang': c }), code);
      await popup.reload();
      await sleep(400);
      const els = await popup.evaluate(() => ({
        tagline: document.querySelector('[data-i18n="tagline"]')?.textContent,
        placeholder: document.querySelector('#phraseInput')?.getAttribute('placeholder'),
        pageBtn: document.querySelector('#pageBtn')?.textContent,
        fromLabel: document.querySelectorAll('.pairopts label span')[0]?.textContent,
        translateBtn: document.querySelector('#goBtn')?.textContent,
        credit: document.querySelector('[data-i18n="credit"]')?.textContent,
        title: document.title,
      }));
      check(`language ${code}: tagline localized`, els.tagline === EXPECTED_LABELS.tagline[code], els.tagline);
      check(`language ${code}: placeholder localized`, typeof els.placeholder === 'string' && els.placeholder.length > 0, els.placeholder);
      check(`language ${code}: page translate button localized`, els.pageBtn === EXPECTED_LABELS.pageTranslate[code], els.pageBtn);
      check(`language ${code}: from label localized`, els.fromLabel === EXPECTED_LABELS.fromL[code], els.fromLabel);
      check(`language ${code}: translate button localized`, els.translateBtn === EXPECTED_LABELS.translate[code], els.translateBtn);
      check(`language ${code}: credit localized`, els.credit === EXPECTED_LABELS.credit[code], els.credit);
      check(`language ${code}: translated document title`, els.title === 'LangBridge', els.title);
      if (code === 'es' || code === 'fr') {
        await popup.evaluate(() => {
          window.__lbPairHelper = null;
          document.getElementById('phraseInput').value = 'floopxyz';
        });
        await popup.evaluate(() => window.__lbDoTranslate());
        await sleep(200);
        const out = await popup.evaluate(() => ({
          text: document.querySelector('#result').textContent.trim(),
          miss: document.querySelector('#result').classList.contains('miss'),
        }));
        check(`language ${code}: honest out-of-dict message localized`, out.miss === true && out.text === EXPECTED_LABELS.noEntry[code], out.text);
      }
    }
  }

  // ---------- FROZEN (defaults after wiping storage) ----------
  console.log('frozen defaults');
  {
    const wipe = await popup.evaluate(() => chrome.storage.local.clear().then(() => chrome.storage.local.get(null)));
    check('storage wiped', Object.keys(wipe).length === 0, JSON.stringify(wipe));
    await popup.reload();
    await sleep(450);
    const defaults = await popup.evaluate(async () => {
      const langStored = await chrome.storage.local.get('lb:lang');
      return {
        pair: window.__lbPair(),
        fromSel: document.getElementById('fromSel').value,
        toSel: document.getElementById('toSel').value,
        lang: langStored['lb:lang'],
      };
    });
    check('default pair en→es', defaults.pair.from === 'en' && defaults.pair.to === 'es', JSON.stringify(defaults.pair));
    check('pair selects reflect defaults', defaults.fromSel === 'en' && defaults.toSel === 'es', defaults.fromSel + '/' + defaults.toSel);
    const stored = await popup.evaluate(() => chrome.storage.local.get(null));
    check('pair not persisted until user acts (honest)', stored['lb:from'] === undefined && stored['lb:to'] === undefined, JSON.stringify(stored));
  }

  // ---------- ZIP / ICONS / LANDING ----------
  console.log('zip & landing');
  {
    const zipFile = path.join(EXT, 'dist', 'langbridge.zip');
    const landingZip = path.join(EXT, 'landing', 'langbridge.zip');
    check('dist zip exists (empty check)', fs.existsSync(zipFile) && fs.statSync(zipFile).size > 0, '');
    check('landing zip copy exists', fs.existsSync(landingZip), '');
    if (fs.existsSync(zipFile) && fs.existsSync(landingZip)) {
      const z = fs.readFileSync(zipFile);
      const l = fs.readFileSync(landingZip);
      check('dist and landing zips byte-identical', z.equals(l), 'zip=' + z.length + ' landing=' + l.length);
      const head = z.subarray(0, 4).toString('latin1');
      check('zip starts with PK signature', head === 'PK\u0003\u0004' || head === 'PK\u0005\u0006', head);
    }
    const gitignore = fs.readFileSync(path.join(EXT, '.gitignore'), 'utf8');
    check('.gitignore covers node_modules', gitignore.includes('node_modules/'), '');
    const landingRaw = fs.readFileSync(path.join(EXT, 'landing', 'index.html'), 'utf8');
    for (const l of ['en', 'es', 'fr', 'pt', 'it', 'de']) {
      check('landing i18n has language ' + l, landingRaw.includes(l + ': {'), '');
    }
    check('landing credits LinkedIn', landingRaw.includes('linkedin.com/in/harleyvasquez/'), '');
    check('landing hosts the zip for download', landingRaw.includes('langbridge.zip'), '');
  }

  // ---------- DEPLOYED LANDING (only when env set) ----------
  if (DEPLOY_URL) {
    console.log('deployed landing');
    const dl = await browser.newPage();
    const dle = [];
    dl.on('pageerror', (err) => dle.push('page:' + err.message));
    dl.on('console', (msg) => {
      if (msg.type() === 'error') dle.push('console:' + msg.text());
    });
    let dlOk = false;
    try {
      const resp = await dl.goto(DEPLOY_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
      dlOk = !!resp && resp.status() === 200;
    } catch (e) {
      dlOk = false;
    }
    check('deployed landing reachable (200)', dlOk, '');
    if (dlOk) {
      const setEs = await dl.evaluate(() => {
        try { localStorage.setItem('lb:landingLang', 'es'); return true; } catch (e) { return false; }
      }).catch(() => false);
      let reloaded = false;
      if (setEs) {
        try {
          await dl.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
          reloaded = true;
        } catch (e) { reloaded = false; }
      }
      await sleep(900);
      const dlEs = await dl.evaluate(() => ({
        title: document.title,
        hero: document.querySelector('[data-i18n="heroTitle"]')?.textContent,
        tag: document.querySelector('[data-i18n="tagline"]')?.textContent,
        credit: document.querySelector('[data-i18n="credit"]')?.textContent,
      }));
      check('deployed landing loads i18n (es tag)', !!setEs && reloaded && dlEs.tag === 'de frase a frase, de página a página', dlEs.tag);
      check('deployed landing has download link', (await dl.evaluate(() => !!document.querySelector('a[href$="langbridge.zip"]'))), '');
    }
    safeClose(dl);
  }

  check('no JS errors in popup', popupErrors.length === 0, popupErrors.join(' | '));
  check('no JS errors on fixture page', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  safeClose(popup);
  safeClose(page);
  if (browser) await browser.close().catch(() => {});
  server.close();
}

console.log('RESULT: ' + passes + ' passed, ' + failures + ' failed');
if (failures > 0) console.log('PROBLEMS:\n  ' + problems.join('\n  '));
process.exit(failures > 0 ? 1 : 0);