// If the app never got going, say so (and offer a reload) instead of showing "Loading…" forever.
setTimeout(function () {
  var s = document.getElementById('subtitle');
  if (!s || s.textContent !== 'Loading…' || document.querySelector('.card')) return;
  document.getElementById('list').innerHTML = '';
  var box = document.getElementById('status');
  box.hidden = false;
  box.innerHTML = '<h2>Couldn’t start</h2><p>The page didn’t finish loading. Reload, or <a href="get/">get the app</a>.</p>' +
    '<div class="actions"><button class="primary-btn" type="button" id="boot-reload">Reload</button></div>';
  document.getElementById('boot-reload').addEventListener('click', function () { location.reload(); });
  s.textContent = 'Couldn’t start';
}, 12000);
