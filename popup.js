const KP = { FROM: 'lb:from', TO: 'lb:to' };
const LANGS = ['en', 'es', 'fr'];

const getLocal = (keys) => chrome.storage.local.get(keys);
const setLocal = (obj) => chrome.storage.local.set(obj);

let from = 'en';
let to = 'es';

function L(key, params) {
  return window.__lbT(key, undefined, params);
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg || '';
}

function showResult(text, miss) {
  const el = document.getElementById('result');
  el.textContent = text;
  el.classList.toggle('miss', !!miss);
}

async function loadPair() {
  const s = await getLocal([KP.FROM, KP.TO]);
  from = LANGS.includes(s[KP.FROM]) ? s[KP.FROM] : 'en';
  to = LANGS.includes(s[KP.TO]) ? s[KP.TO] : 'es';
  if (from === to) to = from === 'en' ? 'es' : 'en';
  document.getElementById('fromSel').value = from;
  document.getElementById('toSel').value = to;
}

async function savePair() {
  from = document.getElementById('fromSel').value;
  to = document.getElementById('toSel').value;
  if (from === to) {
    to = from === 'en' ? 'es' : 'en';
    document.getElementById('toSel').value = to;
  }
  await setLocal({ [KP.FROM]: from, [KP.TO]: to });
}

async function doTranslate() {
  const text = document.getElementById('phraseInput').value.trim();
  if (!text) return;
  await savePair();
  const r = window.__lbPhrase(text, from, to);
  if (r.total === 0) return;
  if (r.missing === 0) {
    showResult(r.out, false);
    setStatus('');
  } else if (r.missing === r.total) {
    showResult(L('noEntry'), true);
    setStatus('');
  } else {
    showResult(r.out + ' — ' + L('partial'), true);
    setStatus('');
  }
  return { out: r.out, missing: r.missing, total: r.total };
}

async function pageTranslate() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || typeof tab.id !== 'number') {
    setStatus(L('pageNotFound'));
    return { sent: false };
  }
  await savePair();
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'lb:pageTranslate', from, to });
    setStatus(res && res.ok && res.done ? L('done') : L('undone'));
    return { sent: true, done: !!(res && res.ok && res.done), reset: !!(res && res.ok && !res.done) };
  } catch (e) {
    setStatus(L('pageNotFound'));
    return { sent: false };
  }
}

async function init() {
  await window.__lbApply(document);
  await loadPair();
  document.getElementById('goBtn').addEventListener('click', () => doTranslate());
  document.getElementById('phraseInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doTranslate();
  });
  document.getElementById('pageBtn').addEventListener('click', () => pageTranslate());
  document.getElementById('fromSel').addEventListener('change', () => savePair());
  document.getElementById('toSel').addEventListener('change', () => savePair());
}

init();

window.__lbDoTranslate = doTranslate;
window.__lbPageTranslate = pageTranslate;
window.__lbLoadPair = loadPair;
window.__lbPair = () => ({ from, to });