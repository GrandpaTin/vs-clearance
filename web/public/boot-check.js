// Runs before the app (no modules, in <head>): if the app's code can't load (offline cache miss, a
// blocked file, a very old browser), say so and offer a reload instead of an endless "Loading…".
(function () {
  var failed = false;
  function fail() {
    if (failed || document.documentElement.dataset.booted) return;
    failed = true;
    var intro = document.getElementById('intro');
    if (intro) intro.hidden = true;
    var search = document.querySelector('.search');
    if (search) search.hidden = true;
    document.getElementById('list').innerHTML = '';
    var box = document.getElementById('status');
    box.hidden = false;
    box.innerHTML = '<div class="badge" aria-hidden="true">⚠️</div><h2>Couldn’t start</h2>' +
      '<p>The page didn’t finish loading. Reload, or <a href="get/">get the app</a>.</p>' +
      '<div class="actions"><button class="primary-btn" type="button" id="boot-reload">Reload</button></div>';
    document.getElementById('boot-reload').addEventListener('click', function () { location.reload(); });
    var refresh = document.getElementById('refresh');
    if (refresh) refresh.addEventListener('click', function () { location.reload(); });
    var s = document.getElementById('subtitle');
    if (s) s.textContent = 'Couldn’t start';
  }
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
  }
  // A script file that fails to load fires "error" on its element; that doesn't bubble, so catch it here.
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT') whenReady(fail);
  }, true);
  // Backstop (e.g. a module that loads but never runs): the app marks itself booted when it starts.
  setTimeout(function () { whenReady(fail); }, 12000);
})();
