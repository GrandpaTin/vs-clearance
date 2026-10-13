// If the app's code never ran (offline cache miss, very old browser), say so and offer a reload,
// instead of showing "Loading…" forever. A slow list download is not this: app.js marks itself booted.
setTimeout(function () {
  if (document.documentElement.dataset.booted) return;
  var intro = document.getElementById('intro');
  if (intro) intro.hidden = true;
  document.getElementById('list').innerHTML = '';
  var box = document.getElementById('status');
  box.hidden = false;
  box.innerHTML = '<div class="badge" aria-hidden="true">⚠️</div><h2>Couldn’t start</h2>' +
    '<p>The page didn’t finish loading. Reload, or <a href="get/">get the app</a>.</p>' +
    '<div class="actions"><button class="primary-btn" type="button" id="boot-reload">Reload</button></div>';
  document.getElementById('boot-reload').addEventListener('click', function () { location.reload(); });
  var s = document.getElementById('subtitle');
  if (s) s.textContent = 'Couldn’t start';
}, 12000);
