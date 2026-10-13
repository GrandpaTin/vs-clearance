// Runs before the app (no modules, in <head>): if the app's code can't load (offline cache miss, a
// blocked file, a very old browser), say so and offer a reload instead of an endless "Loading…".
(function () {
  var shown = null;
  function booted() { return !!document.documentElement.dataset.booted; }
  function reloadIfNotBooted() { if (!booted()) location.reload(); }
  function show(broken) {
    if (booted() || shown === 'broken' || shown === (broken ? 'broken' : 'slow')) return;
    shown = broken ? 'broken' : 'slow';
    if (broken) {
      var intro = document.getElementById('intro');
      if (intro) intro.hidden = true;
      var search = document.querySelector('.search');
      if (search) search.hidden = true;
      document.getElementById('list').innerHTML = '';
    }
    var box = document.getElementById('status');
    box.hidden = false;
    box.innerHTML = broken
      ? '<div class="badge" aria-hidden="true">⚠️</div><h2>Couldn’t start</h2>' +
        '<p>The page didn’t finish loading. Reload, or <a href="get/">get the app</a>.</p>' +
        '<div class="actions"><button class="primary-btn" type="button" id="boot-reload">Reload</button></div>'
      : '<div class="badge" aria-hidden="true">⏳</div><h2>Still loading…</h2>' +
        '<p>Your connection is slow. The deals will appear as soon as the page finishes loading.</p>' +
        '<div class="actions"><button class="outline-btn" type="button" id="boot-reload">Reload</button></div>';
    document.getElementById('boot-reload').addEventListener('click', reloadIfNotBooted);
    var refresh = document.getElementById('refresh');
    // Only until the app starts: after that the button is the app's own "check for newer deals".
    if (refresh && broken) refresh.addEventListener('click', reloadIfNotBooted);
    var s = document.getElementById('subtitle');
    if (s) s.textContent = broken ? 'Couldn’t start' : 'Still loading — slow connection…';
  }
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
  }
  // A script file that fails to load fires "error" on its element; that doesn't bubble, so catch it here.
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT') whenReady(function () { show(true); });
  }, true);
  // Backstop: usually just a slow connection (the app marks itself booted when it starts).
  setTimeout(function () { whenReady(function () { show(false); }); }, 12000);
})();
