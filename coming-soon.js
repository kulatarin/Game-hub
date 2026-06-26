// ── countdown to an arbitrary launch date (30 days from now) ──
const launch = new Date();
launch.setDate(launch.getDate() + 30);
launch.setHours(0, 0, 0, 0);

function pad(n) { return String(n).padStart(2, '0'); }

function tick() {
  const diff = launch - Date.now();
  if (diff <= 0) {
    document.getElementById('cd-days').textContent = '00';
    document.getElementById('cd-hrs').textContent  = '00';
    document.getElementById('cd-min').textContent  = '00';
    document.getElementById('cd-sec').textContent  = '00';
    return;
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000)  / 60000);
  const s = Math.floor((diff % 60000)    / 1000);
  document.getElementById('cd-days').textContent = pad(d);
  document.getElementById('cd-hrs').textContent  = pad(h);
  document.getElementById('cd-min').textContent  = pad(m);
  document.getElementById('cd-sec').textContent  = pad(s);
}

tick();
setInterval(tick, 1000);

// ── notify form ──
function handleNotify() {
  const email = document.getElementById('email-input').value.trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) {
    document.getElementById('email-input').style.borderColor = 'var(--red)';
    document.getElementById('email-input').style.boxShadow   = '0 0 8px var(--red)';
    return;
  }
  document.getElementById('notify-form').style.display = 'none';
  document.getElementById('success-msg').style.display = 'block';
}
