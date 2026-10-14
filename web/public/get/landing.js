// Share page: show this page's own address, copy it, and put the visitor's platform first.
(function () {
  // Friends get the deals page (it links back here), not the install steps.
  var url = location.origin + location.pathname.replace(/get\/(index\.html)?$/, '');
  document.getElementById('share-url').textContent = url;
  var canShare = !!navigator.share && /iphone|ipad|android/i.test(navigator.userAgent);
  if (canShare) document.getElementById('copy-link').textContent = 'Share link';
  document.getElementById('copy-link').addEventListener('click', function () {
    var btn = this;
    var label = btn.textContent;
    var done = function () { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = label; }, 2000); };
    if (canShare) {
      navigator.share({ title: 'VS Clearance', text: 'Vitamin Shoppe clearance deal finder', url: url })
        .catch(function (e) { if (!e || e.name !== 'AbortError') fallback(); });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
    // Clipboard refused: the old select-and-copy route, or show the link to copy by hand.
    function fallback() {
      var t = document.createElement('textarea');
      t.value = url; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(t); t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* not supported */ }
      t.remove();
      if (ok) return done();
      // Nothing can copy here: select the link shown on the page so a long-press copies it.
      var shown = document.getElementById('share-url');
      var sel = window.getSelection && window.getSelection();
      if (shown && sel) { sel.selectAllChildren(shown); shown.scrollIntoView({ block: 'center' }); }
      btn.textContent = 'Link selected — press and hold to copy';
      setTimeout(function () { btn.textContent = label; }, 4000);
    }
  });
  // Show download sizes so people know what they're getting.
  function size(file, id, text) {
    fetch(file, { method: 'HEAD' }).then(function (r) {
      var n = Number(r.headers.get('Content-Length'));
      if (!r.ok || !n) return;
      var s = n >= 1048576 ? Math.round(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
      document.getElementById(id).textContent = text.replace('%s', s);
    }).catch(function () {});
  }
  size('../downloads/VS-Clearance-project.zip', 'zip-label', 'Download source (zip) · %s');
  size('../downloads/VS-Clearance.apk', 'apk-label', 'Download the app (APK) · %s');
  var ua = navigator.userAgent;
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /android/i.test(ua);
  var id = ios ? 'iphone' : android ? 'android' : 'pc';
  var card = document.getElementById(id);
  card.classList.add('highlight');
  document.getElementById(id + '-badge').hidden = false;
  card.parentNode.insertBefore(card, card.parentNode.querySelector('.card'));
})();
