/* Webcord codespace runner.
   Lives in preview.html, which the editor embeds in a sandboxed iframe WITHOUT allow-same-origin, so code running here can't touch
   Webcord's page, storage or login token. The editor posts { kind, entry, files } and this script either
   - builds a real HTML page from the codespace files (links between files are wired up) and writes it into this document, or
   - runs Python with Pyodide. Console output / title / navigation are reported back with postMessage. */
(function () {
  'use strict';
  var PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  var post = function (m) { try { parent.postMessage(Object.assign({ wc: 1 }, m), '*'); } catch (e) { /* ignore */ } };
  var log = function (level, text) { post({ type: 'console', level: level, text: String(text) }); };

  var MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain', md: 'text/markdown', xml: 'application/xml', csv: 'text/csv' };
  var ext = function (p) { return (p.split('.').pop() || '').toLowerCase(); };
  var mimeOf = function (p) { return MIME[ext(p)] || 'text/plain'; };
  /* name=<path> rides along in the data: URL so error handlers can tell which file a script came from */
  var dataUrl = function (p, text) { return 'data:' + mimeOf(p) + ';name=' + encodeURIComponent(p) + ';charset=utf-8,' + encodeURIComponent(text); };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var dirname = function (p) { return p.indexOf('/') >= 0 ? p.slice(0, p.lastIndexOf('/')) : ''; };

  /* Resolve a relative reference against the file it appears in. Returns a normalised path, or null for absolute URLs. */
  function resolve(base, ref) {
    ref = String(ref).split('#')[0].split('?')[0].trim();
    if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.slice(0, 2) === '//') return null;
    var parts = ref.charAt(0) === '/' ? [] : dirname(base).split('/').filter(Boolean);
    ref.split('/').forEach(function (seg) { if (!seg || seg === '.') return; if (seg === '..') parts.pop(); else parts.push(seg); });
    return parts.join('/');
  }
  function lookup(files, path, tryJs) {
    if (path == null) return null;
    if (has(files, path)) return path;
    if (tryJs) { var c = [path + '.js', path + '.mjs', path + '/index.js']; for (var i = 0; i < c.length; i++) if (has(files, c[i])) return c[i]; }
    return null;
  }

  /* import './x.js' → import '@cs/x.js' (an import map points @cs/… at the file's contents) */
  function rewriteImports(src, from, files) {
    return src.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"\n]*|\/[^'"\n]*)\2/g, function (m, pre, q, spec) {
      var t = lookup(files, resolve(from, spec), true);
      return t ? pre + q + '@cs/' + t + q : m;
    });
  }
  /* @import and url() inside CSS */
  function cssResolve(css, from, files, depth) {
    css = css.replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?\s*([^;]*);/g, function (m, q, ref, media) {
      var t = lookup(files, resolve(from, ref));
      if (!t || depth > 4) return m;
      var inner = cssResolve(files[t], t, files, depth + 1);
      return media && media.trim() ? '@media ' + media.trim() + ' {' + inner + '}' : inner;
    });
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (m, q, ref) {
      var t = lookup(files, resolve(from, ref));
      return t ? 'url("' + dataUrl(t, files[t]) + '")' : m;
    });
  }

  /* Code that runs INSIDE the user's page (first thing in <head>): console capture, storage shims, fetch/XHR for codespace files, link handling. */
  function prelude(cfg) {
    var files = cfg.files, P = function (m) { try { parent.postMessage(Object.assign({ wc: 1 }, m), '*'); } catch (e) { /* ignore */ } };
    var MIME = cfg.mime;
    function mem() {
      var d = {};
      return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; }, clear: function () { d = {}; }, key: function (i) { return Object.keys(d)[i] || null; }, get length() { return Object.keys(d).length; } };
    }
    try { Object.defineProperty(window, 'localStorage', { value: mem(), configurable: true }); } catch (e) { /* ignore */ }
    try { Object.defineProperty(window, 'sessionStorage', { value: mem(), configurable: true }); } catch (e) { /* ignore */ }
    try {
      var jar = {};
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function () { return Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; '); },
        set: function (v) { var kv = String(v).split(';')[0], i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1); },
      });
    } catch (e) { /* ignore */ }

    function fmt(a) {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
      if (typeof a === 'function') return String(a);
      if (a === undefined) return 'undefined';
      try {
        var seen = new WeakSet();
        return JSON.stringify(a, function (k, v) {
          if (typeof v === 'bigint') return v + 'n';
          if (typeof v === 'function') return '[Function]';
          if (v instanceof Map) return { Map: Array.from(v) };
          if (v instanceof Set) return { Set: Array.from(v) };
          if (typeof v === 'object' && v !== null) { if (seen.has(v)) return '[Circular]'; seen.add(v); }
          return v;
        }, 2);
      } catch (e) { return String(a); }
    }
    ['log', 'info', 'warn', 'error', 'debug', 'table', 'dir'].forEach(function (l) {
      var orig = console[l];
      console[l] = function () {
        P({ type: 'console', level: l === 'debug' || l === 'table' || l === 'dir' ? 'log' : l, text: [].map.call(arguments, fmt).join(' ').slice(0, 5000) });
        try { orig.apply(console, arguments); } catch (e) { /* ignore */ }
      };
    });
    console.clear = function () { P({ type: 'clear' }); };
    window.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t !== window && t.tagName) {
        var src = t.src || t.href;
        if (src && !/^data:/.test(src)) P({ type: 'console', level: 'error', text: 'Failed to load resource: ' + src });
        return;
      }
      var f = e.filename || '', m = /;name=([^;,]+)/.exec(f), file = m ? decodeURIComponent(m[1]) : '';
      P({ type: 'console', level: 'error', text: (e.message || 'Error') + (file ? '\n    at ' + file + ':' + e.lineno + ':' + e.colno : '') });
    }, true);
    window.addEventListener('unhandledrejection', function (e) { P({ type: 'console', level: 'error', text: 'Uncaught (in promise) ' + fmt(e.reason) }); });

    function norm(base, ref) {
      ref = String(ref).split('#')[0].split('?')[0];
      var parts = ref.charAt(0) === '/' ? [] : base.split('/').slice(0, -1).filter(Boolean);
      ref.split('/').forEach(function (s) { if (!s || s === '.') return; if (s === '..') parts.pop(); else parts.push(s); });
      return parts.join('/');
    }
    function isRel(u) { return !/^[a-z][a-z0-9+.-]*:/i.test(u) && u.slice(0, 2) !== '//'; }
    function mimeOf(p) { return MIME[(p.split('.').pop() || '').toLowerCase()] || 'text/plain'; }
    var realFetch = window.fetch;
    window.fetch = function (input) {
      var u = String(input && input.url ? input.url : input);
      if (isRel(u)) {
        var p = norm(cfg.page, u);
        if (Object.prototype.hasOwnProperty.call(files, p)) return Promise.resolve(new Response(files[p], { status: 200, headers: { 'content-type': mimeOf(p) + '; charset=utf-8' } }));
        P({ type: 'console', level: 'error', text: 'GET /' + p + ' 404 (Not Found)' });
        return Promise.resolve(new Response('Not found', { status: 404, statusText: 'Not Found' }));
      }
      return realFetch.apply(this, arguments);
    };
    var realOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = [].slice.call(arguments), u = String(url);
      if (isRel(u)) {
        var p = norm(cfg.page, u);
        if (Object.prototype.hasOwnProperty.call(files, p)) args[1] = 'data:' + mimeOf(p) + ';charset=utf-8,' + encodeURIComponent(files[p]);
        else P({ type: 'console', level: 'error', text: 'GET /' + p + ' 404 (Not Found)' });
      }
      return realOpen.apply(this, args);
    };

    /* links between pages */
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.hasAttribute('download')) return;
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#' || /^(javascript|mailto|tel|data|blob):/i.test(h)) return;
      e.preventDefault();
      if (/^https?:\/\//i.test(h) || h.slice(0, 2) === '//') { window.open(a.href, '_blank'); return; }
      P({ type: 'navigate', href: h });
    }, false);
    document.addEventListener('submit', function (e) {
      if (!e.defaultPrevented) { e.preventDefault(); P({ type: 'console', level: 'info', text: 'Form submitted — page navigation on submit is disabled in the preview.' }); }
    }, false);
    /* location.href = 'page.html' and friends (Navigation API: Chrome/Edge/Safari) */
    try {
      if (window.navigation && window.navigation.addEventListener) {
        var dir = location.href.split('#')[0].split('?')[0]; dir = dir.slice(0, dir.lastIndexOf('/') + 1);
        window.navigation.addEventListener('navigate', function (e) {
          if (!e.cancelable || e.hashChange || e.downloadRequest || e.destination.sameDocument) return;
          var url = e.destination.url;
          if (url.indexOf(dir) === 0) { e.preventDefault(); P({ type: 'navigate', href: url.slice(dir.length) }); }
          else if (/^https?:/i.test(url)) { e.preventDefault(); window.open(url, '_blank'); }
        });
      }
    } catch (e) { /* ignore */ }

    /* title + load state */
    function sendTitle() { P({ type: 'title', title: document.title }); }
    document.addEventListener('DOMContentLoaded', function () {
      sendTitle();
      var t = document.querySelector('title');
      if (t) new MutationObserver(sendTitle).observe(t, { childList: true, characterData: true, subtree: true });
    });
    window.addEventListener('load', function () { sendTitle(); P({ type: 'loaded' }); });

    /* console input from the editor */
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (e.source !== parent || !d || d.wc !== 1 || d.type !== 'eval') return;
      try { var r = (0, eval)(String(d.code)); P({ type: 'console', level: 'result', text: fmt(r) }); } catch (err) { P({ type: 'console', level: 'error', text: String(err && err.stack || err) }); }
    });
  }

  function buildHtml(files, entry, opts) {
    var doc = new DOMParser().parseFromString(files[entry], 'text/html');
    var $$ = function (s) { return Array.prototype.slice.call(doc.querySelectorAll(s)); };
    var local = function (from, ref) { return ref ? lookup(files, resolve(from, ref)) : null; };

    var imports = {};
    Object.keys(files).forEach(function (p) { if (/\.m?js$/.test(p)) imports['@cs/' + p] = dataUrl(p, rewriteImports(files[p], p, files)); });
    $$('script[type="importmap"]').forEach(function (s) {
      try { Object.assign(imports, JSON.parse(s.textContent).imports || {}); } catch (e) { /* ignore bad import map */ }
      s.remove();
    });

    $$('link[rel~="stylesheet"][href]').forEach(function (l) {
      var p = local(entry, l.getAttribute('href')); if (!p) return;
      var st = doc.createElement('style'); st.setAttribute('data-path', p);
      if (l.getAttribute('media')) st.setAttribute('media', l.getAttribute('media'));
      st.textContent = cssResolve(files[p], p, files, 0);
      l.replaceWith(st);
    });
    $$('style:not([data-path])').forEach(function (s) { s.textContent = cssResolve(s.textContent, entry, files, 0); });
    $$('link[rel~="icon"][href]').forEach(function (l) { var p = local(entry, l.getAttribute('href')); if (p) l.setAttribute('href', dataUrl(p, files[p])); });

    $$('script[src]').forEach(function (s) {
      var p = local(entry, s.getAttribute('src')); if (!p) return;
      var mod = (s.getAttribute('type') || '').toLowerCase() === 'module';
      s.setAttribute('src', dataUrl(p, mod ? rewriteImports(files[p], p, files) : files[p]));
      s.removeAttribute('integrity'); s.removeAttribute('crossorigin');
    });
    $$('script[type="module"]:not([src])').forEach(function (s) { s.textContent = rewriteImports(s.textContent, entry, files); });

    [['img', 'src'], ['source', 'src'], ['video', 'src'], ['video', 'poster'], ['audio', 'src'], ['embed', 'src'], ['track', 'src'], ['input[type="image"]', 'src']].forEach(function (pair) {
      $$(pair[0] + '[' + pair[1] + ']').forEach(function (el) { var p = local(entry, el.getAttribute(pair[1])); if (p) el.setAttribute(pair[1], dataUrl(p, files[p])); });
    });
    $$('iframe[src]').forEach(function (el) {
      var p = local(entry, el.getAttribute('src')); if (!p) return;
      if (/\.html?$/.test(p) && (opts.depth || 0) < 2) { el.removeAttribute('src'); el.setAttribute('srcdoc', buildHtml(files, p, { depth: (opts.depth || 0) + 1, nested: true })); }
      else el.setAttribute('src', dataUrl(p, files[p]));
    });

    var head = doc.head || doc.documentElement;
    if (Object.keys(imports).length) {
      var im = doc.createElement('script'); im.setAttribute('type', 'importmap');
      im.textContent = JSON.stringify({ imports: imports }); head.insertBefore(im, head.firstChild);
    }
    if (!opts.nested) {
      var pre = doc.createElement('script');
      pre.textContent = '(' + prelude.toString() + ')(' + JSON.stringify({ files: files, page: entry, mime: MIME }).replace(/</g, '\\u003c') + ');';
      head.insertBefore(pre, head.firstChild);
    }
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  function notFoundPage(path) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>404 Not Found</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#3b3857;background:#faf9ff">' +
      '<div style="text-align:center;padding:24px"><div style="font-size:64px;font-weight:800;color:#5b4cf0">404</div><p style="margin:8px 0 0"><b></b> was not found in this codespace.</p></div></body></html>'.replace('<b></b>', '<b>/' + String(path).replace(/[&<>"]/g, '') + '</b>');
  }

  /* ---------------- Python (Pyodide) ---------------- */
  var pyP = null, pyFiles = [];
  function loadPy() {
    if (pyP) return pyP;
    pyP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PYODIDE + 'pyodide.js';
      s.onload = res; s.onerror = function () { rej(new Error('Could not load Python (Pyodide). Check your connection and try again.')); };
      document.head.appendChild(s);
    }).then(function () {
      return window.loadPyodide({
        indexURL: PYODIDE,
        stdout: function (t) { log('log', t); },
        stderr: function (t) { log('error', t); },
        stdin: function () { var r = window.prompt('Your program is asking for input:'); return r === null ? undefined : r; },
      });
    }).catch(function (e) { pyP = null; throw e; });
    return pyP;
  }
  function cleanPyError(msg, entry) {
    var lines = String(msg).split('\n'), out = [];
    for (var i = 0; i < lines.length; i++) {
      if (/File "\/lib\/python[^"]*"/.test(lines[i]) && /_pyodide/.test(lines[i])) { if (/^\s{4}/.test(lines[i + 1] || '')) i++; continue; }
      out.push(lines[i].replace('File "<exec>"', 'File "' + entry + '"'));
    }
    return out.join('\n').trim();
  }
  async function runPython(files, entry) {
    var first = !pyP;
    if (first) log('info', 'Loading Python… (the first run downloads about 10 MB)');
    var py = await loadPy();
    if (first) log('info', 'Python ready.');
    pyFiles.forEach(function (p) { if (!has(files, p)) { try { py.FS.unlink(p); } catch (e) { /* ignore */ } } });
    Object.keys(files).forEach(function (p) {
      if (p.indexOf('/') > 0) { try { py.FS.mkdirTree(dirname(p)); } catch (e) { /* exists */ } }
      py.FS.writeFile(p, files[p]);
    });
    pyFiles = Object.keys(files);
    py.runPython('import sys\nfor _m in [m for m, v in list(sys.modules.items()) if str(getattr(v, "__file__", "") or "").startswith("/home/pyodide/")]:\n    sys.modules.pop(_m, None)');
    var ok = true;
    try {
      await py.loadPackagesFromImports(Object.keys(files).filter(function (p) { return /\.py$/.test(p); }).map(function (p) { return files[p]; }).join('\n'));
      var g = py.globals.get('dict')(); g.set('__name__', '__main__');
      try { await py.runPythonAsync(files[entry], { globals: g }); } finally { g.destroy(); }
    } catch (e) { ok = false; log('error', cleanPyError(e && e.message || e, entry)); }
    post({ type: 'done', ok: ok });
  }

  async function run(payload) {
    var files = Object.assign(Object.create(null), payload.files || {});
    if (payload.kind === 'python') return runPython(files, payload.entry);
    var html = payload.notFound != null ? notFoundPage(payload.notFound) : buildHtml(files, payload.entry, {});
    document.open(); document.write(html); document.close();
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== parent || !d || d.wc !== 1 || d.type !== 'run') return;
    run(d.payload).catch(function (err) { log('error', (err && err.message) || err); post({ type: 'done', ok: false }); });
  });
  self.__wcRunner = { resolve: resolve, lookup: lookup, rewriteImports: rewriteImports, cssResolve: cssResolve, dataUrl: dataUrl };
  post({ type: 'ready' });
}());
