(() => {
  if (window.__lbBooted) return;
  window.__lbBooted = true;

  const KP = { FROM: 'lb:from', TO: 'lb:to' };
  const LANGS = ['en', 'es', 'fr'];
  let tip = null;
  let pill = null;
  let originals = null;
  let translated = false;

  const getLocal = (keys) => chrome.storage.local.get(keys);

  async function pair() {
    const s = await getLocal([KP.FROM, KP.TO]);
    let from = LANGS.includes(s[KP.FROM]) ? s[KP.FROM] : 'en';
    let to = LANGS.includes(s[KP.TO]) ? s[KP.TO] : 'es';
    if (from === to) to = from === 'en' ? 'es' : 'en';
    return { from, to };
  }

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function wordAt(el) {
    const t = textOf(el);
    return t ? t.split(/\s+/)[0].toLowerCase() : '';
  }

  function closeTip() {
    if (tip) tip.remove();
    tip = null;
  }

  async function showTip(el) {
    closeTip();
    const w = wordAt(el);
    const p = await pair();
    const word = w.replace(/[.,!?;:()"'«»-]+$/g, '').replace(/^[.,!?;:()"'«»-]+/g, '');
    const r = window.__lbResolve(word, p.from, p.to);
    tip = document.createElement('div');
    tip.setAttribute('data-lb-tip', '');
    tip.style.cssText =
      'position:fixed;z-index:2147483647;background:#141004;color:#fdf3e0;border:1px solid #f59e0b;' +
      'border-radius:10px;padding:8px 10px;font:12px/1.5 system-ui,sans-serif;max-width:280px;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.45);pointer-events:auto;';
    if (r) {
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const piv = r.pivot ? ' <span style="color:#c9a86a">(' + p.from + '&rarr;en&rarr;' + p.to + ')</span>' : '';
      tip.innerHTML =
        '<div style="color:#fbbf24;font-weight:700;margin-bottom:3px;">' + esc(r.word) + ' &rarr; ' + esc(r.out) + piv + '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<a href="#" data-lb-copy style="color:#f59e0b;text-decoration:none;">' + esc(window.__lbT('tipCopy')) + '</a>' +
        '</div>';
    } else {
      tip.innerHTML =
        '<div style="color:#c9a86a;">' + esc(w) + ' &mdash; ' + esc(window.__lbT('noEntry')) + '</div>';
    }
    tip.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-lb-copy')) {
        e.preventDefault();
        navigator.clipboard.writeText(r ? r.out : '').then(() => {
          const a = tip.querySelector('[data-lb-copy]');
          if (a) a.textContent = window.__lbT('tipCopied');
        });
      }
    });
    document.documentElement.appendChild(tip);
    const r2 = tip.getBoundingClientRect();
    let x = Math.round(el.getBoundingClientRect().left);
    let y = Math.round(el.getBoundingClientRect().bottom + 6);
    if (x + r2.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r2.width - 8);
    if (y + r2.height > window.innerHeight - 8) y = Math.max(8, el.getBoundingClientRect().top - r2.height - 6);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function walkTextNodes(root, fn) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (p && (p.closest('script, style, noscript, textarea, input, [data-lb-tip], [data-lb-pill]'))) {
          return NodeFilter.FILTER_REJECT;
        }
        const t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
        return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (true) {
      const n = walker.nextNode();
      if (!n) break;
      nodes.push(n);
    }
    for (const node of nodes) fn(node);
  }

  async function translatePage() {
    const p = await pair();
    if (translated) {
      translatePageRestore();
      return { ok: true, done: false };
    }
    originals = [];
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fromWords = window.__lbWords(p.from);
    walkTextNodes(document.body, (node) => {
      const original = node.nodeValue;
      originals.push(original);
      const words = original.toLowerCase().split(/\W+/).filter(Boolean);
      if (!words.some((w) => window.__lbResolve(w, p.from, p.to))) return;
      let v = original;
      for (const w of fromWords) {
        if (!v) break;
        const r = window.__lbResolve(w, p.from, p.to);
        if (!r || r.out === w) continue;
        const re = new RegExp('\\b(' + esc(w) + ')\\b', 'gi');
        if (re.test(v)) v = v.replace(re, r.out);
      }
      node.nodeValue = v;
    });
    translated = true;
    return { ok: true, done: true };
  }

  function translatePageRestore() {
    if (originals) {
      let i = 0;
      walkTextNodes(document.body, (node) => {
        node.nodeValue = originals[i++];
      });
    }
    originals = null;
    translated = false;
  }

  function ensurePill() {
    if (pill) return;
    pill = document.createElement('button');
    pill.setAttribute('data-lb-pill', '');
    pill.textContent = 'LB';
    pill.title = window.__lbT('tipTitle');
    pill.style.cssText =
      'position:fixed;z-index:2147483646;right:14px;bottom:14px;width:44px;height:44px;border-radius:50%;' +
      'background:#f59e0b;color:#241200;font:800 15px/1 system-ui,sans-serif;border:0;cursor:pointer;' +
      'box-shadow:0 6px 16px rgba(0,0,0,.4);';
    pill.addEventListener('click', () => {
      translatePage().then((r) => {
        pill.textContent = r.done ? 'LB' : 'LB';
      });
    });
    document.documentElement.appendChild(pill);
  }

  document.addEventListener('click', async (e) => {
    if (tip && !tip.contains(e.target)) closeTip();
    if (e.target.closest && e.target.closest('[data-lb-pill]')) return;
    if (tip && tip.contains(e.target)) return;
    if (e.target && e.target.nodeType === 1 && !e.target.closest('[data-lb-pill]')) {
      ensurePill();
      const el = e.target;
      const first = wordAt(el);
      if (first) showTip(el).catch(() => {});
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTip();
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'lb:pageTranslate') {
      ensurePill();
      translatePage().then((r) => sendResponse({ ok: r.ok, done: r.done, reset: !r.done }));
      return true;
    }
    if (msg && msg.type === 'lb:ping') {
      sendResponse({ pong: true });
      return true;
    }
    return false;
  });

  window.__lbFrRepro = { pair, wordAt, walkTextNodes, translatePage };
  window.__lbTooltipShown = () => !!tip;
  window.__lbTipText = () => (tip ? tip.textContent : '');
  window.__lbCloseTip = closeTip;
  window.__lbTranslating = () => ({ translated, originals: !!originals });
})();