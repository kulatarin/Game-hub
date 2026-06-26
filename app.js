const PLAYER_COLORS   = ['c0', 'c1', 'c2', 'c3'];
const PLAYER_DEFAULTS = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
const MAX_PLAYERS     = 4;
const PRESET_AVATARS  = [
  '🧑','👩','🧔','👱','🧒','👧','🧓','👴',
  '🦊','🐺','🐯','🦁','🐻','🐼','🐸','🤖'
];

const GAMES = {
  ludo:       { name: 'Ludo',             minPlayers: 2, maxPlayers: 4, file: 'ludo.html' },
  snakes:     { name: 'Snakes & Ladders', minPlayers: 2, maxPlayers: 4, file: 'snakes.html' },
  chess:      { name: 'Chess',            minPlayers: 2, maxPlayers: 2, file: 'chess.html' },
  checkers:   { name: 'Checkers',         minPlayers: 2, maxPlayers: 2, file: 'checkers.html' },
  dots:       { name: 'Dots & Boxes',     minPlayers: 2, maxPlayers: 4, file: 'dots.html' },
  ttt:        { name: 'Tic-Tac-Toe',      minPlayers: 2, maxPlayers: 2, file: 'ttt.html' },
  memory:     { name: 'Memory Flip',      minPlayers: 1, maxPlayers: 4, file: 'memory.html' },
  sliding:    { name: 'Sliding Puzzle',   minPlayers: 1, maxPlayers: 2, file: 'sliding.html' },
  colormatch: { name: 'Color Match',      minPlayers: 1, maxPlayers: 4, file: 'colormatch.html' },
  buttonmash: { name: 'Button Mash Race', minPlayers: 2, maxPlayers: 4, file: 'buttonmash.html' },
  dodge:      { name: 'Dodging Game',     minPlayers: 1, maxPlayers: 2, file: 'dodge.html' },
  coming-soon:{ name: 'Up coming Game',   minPlayers: 1, maxPlayers: 4, file: 'Coming-soon.html' },
};

// ── State ─────────────────────────────────────────────────────────────────────
function loadState() {
  try {
    const s = sessionStorage.getItem('gamehub_state');
    if (s) return JSON.parse(s);
  } catch(_) {}
  return {
    players: [{ name: 'Player 1', score: 0, isAI: false, avatar: '🧑' }],
    selectedGame: null
  };
}

function saveState() {
  try { sessionStorage.setItem('gamehub_state', JSON.stringify(state)); } catch(_) {}
}

let state = loadState();

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  renderScoreboard();
  renderPlayerSetup();
  syncGameCards();
  renderLaunch();
}

function renderScoreboard() {
  const el = document.getElementById('scoreboard');
  if (!state.players.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:4px 0;">No players yet.</p>';
    return;
  }
  const sorted = [...state.players].map((p, i) => ({ ...p, idx: i }))
    .sort((a, b) => b.score - a.score);

  el.innerHTML = sorted.map(p => {
    const avatarHtml = p.avatar?.startsWith('data:')
      ? `<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="avatar"/>`
      : (p.avatar || initials(p.name));
    return `
      <div class="score-card">
        <div class="score-avatar ${PLAYER_COLORS[p.idx]}">${avatarHtml}</div>
        <div class="score-info">
          <div class="score-name">${escHtml(p.name)}</div>
          <div class="score-pts">${p.score}<span>pts</span></div>
        </div>
      </div>`;
  }).join('');
}

function renderPlayerSetup() {
  const el = document.getElementById('playersSetup');
  el.innerHTML = state.players.map((p, i) => {
    const avatarHtml = p.avatar?.startsWith('data:')
      ? `<img src="${p.avatar}" alt="avatar"/>`
      : (p.avatar || '🧑');
    return `
      <div class="player-row">
        <div class="avatar-col">
          <div class="avatar-display" onclick="openAvatarModal(${i})">${avatarHtml}</div>
          <button class="avatar-edit-btn" onclick="openAvatarModal(${i})">Edit</button>
        </div>
        <span class="player-label">Player ${i + 1}</span>
        <input
          class="player-name-input"
          type="text"
          maxlength="16"
          value="${escHtml(p.name)}"
          placeholder="${PLAYER_DEFAULTS[i]}"
          oninput="updateName(${i}, this.value)"
          onblur="cleanName(${i}, this)"
          ${p.isAI ? 'disabled' : ''}
        />
        <button class="btn-type-toggle ${p.isAI ? 'is-ai' : ''}" onclick="toggleType(${i})">
          ${p.isAI ? '🤖 AI' : '👤 Human'}
        </button>
        <span class="player-score-badge">${p.score} pts</span>
        ${state.players.length > 1
          ? `<button class="btn-remove" onclick="removePlayer(${i})" aria-label="Remove">&times;</button>`
          : ''}
      </div>`;
  }).join('');

  document.getElementById('addPlayerBtn').style.display =
    state.players.length >= MAX_PLAYERS ? 'none' : 'inline-flex';
}

function syncGameCards() {
  document.querySelectorAll('.game-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.game === state.selectedGame);
  });
}

function renderLaunch() {
  const btn   = document.getElementById('launchBtn');
  const hint  = document.getElementById('launchHint');
  const game  = state.selectedGame ? GAMES[state.selectedGame] : null;
  const count = state.players.length;

  if (!game) {
    btn.disabled = true;
    hint.textContent = 'Select a game to continue';
    return;
  }
  if (count < game.minPlayers) {
    btn.disabled = true;
    hint.textContent = `${game.name} needs at least ${game.minPlayers} player${game.minPlayers > 1 ? 's' : ''}`;
    return;
  }
  if (count > game.maxPlayers) {
    btn.disabled = true;
    hint.textContent = `${game.name} supports max ${game.maxPlayers} player${game.maxPlayers > 1 ? 's' : ''}`;
    return;
  }
  btn.disabled = false;
  hint.textContent = `Ready — ${count} player${count > 1 ? 's' : ''} · ${game.name}`;
}

// ── Player actions ────────────────────────────────────────────────────────────
function addPlayer() {
  if (state.players.length >= MAX_PLAYERS) return;
  const i = state.players.length;
  state.players.push({ name: PLAYER_DEFAULTS[i], score: 0, isAI: false, avatar: PRESET_AVATARS[i] });
  saveState();
  render();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.player-name-input');
    if (inputs[i]) inputs[i].focus();
  }, 50);
}

function removePlayer(index) {
  if (state.players.length <= 1) return;
  state.players.splice(index, 1);
  saveState();
  render();
}

function updateName(index, value) {
  state.players[index].name = value.trim() || PLAYER_DEFAULTS[index];
  saveState();
  renderScoreboard();
  renderLaunch();
}

function cleanName(index, input) {
  if (!input.value.trim()) {
    state.players[index].name = PLAYER_DEFAULTS[index];
    input.value = PLAYER_DEFAULTS[index];
    saveState();
    renderScoreboard();
  }
}

function toggleType(index) {
  state.players[index].isAI = !state.players[index].isAI;
  state.players[index].name = state.players[index].isAI
    ? `Bot ${index + 1}` : PLAYER_DEFAULTS[index];
  saveState();
  render();
}

// ── Game selection ────────────────────────────────────────────────────────────
function selectGame(gameId) {
  state.selectedGame = state.selectedGame === gameId ? null : gameId;
  saveState();
  syncGameCards();
  renderLaunch();
}

function launchGame() {
  const game = GAMES[state.selectedGame];
  if (!game) return;
  saveState();
  window.location.href = game.file;
}

// ── Scores ────────────────────────────────────────────────────────────────────
function addScore(playerIndex, points) {
  if (playerIndex < 0 || playerIndex >= state.players.length) return;
  state.players[playerIndex].score += points;
  saveState();
  renderScoreboard();
  renderPlayerSetup();
}

function resetScores() {
  state.players.forEach(p => p.score = 0);
  saveState();
  render();
  showToast('Scores reset');
}

// ── Avatar modal ──────────────────────────────────────────────────────────────
let avatarTargetIndex = null;
let pendingAvatar     = null;

function openAvatarModal(index) {
  avatarTargetIndex = index;
  pendingAvatar     = state.players[index].avatar || PRESET_AVATARS[0];

  document.getElementById('avatarModalTitle').textContent =
    `Choose Avatar — ${state.players[index].name}`;

  const grid = document.getElementById('avatarPresetGrid');
  grid.innerHTML = PRESET_AVATARS.map(a => `
    <button class="avatar-preset-btn ${pendingAvatar === a ? 'selected' : ''}"
            onclick="selectPresetAvatar('${a}', this)">
      ${a}
    </button>`).join('');

  // Reset upload area
  document.getElementById('avatarUploadArea').innerHTML = `
    <label class="avatar-upload-label">
      Click to upload an image<br><span>JPG, PNG, GIF supported</span>
    </label>
    <input type="file" id="avatarUploadInput" accept="image/*" onchange="handleAvatarUpload(event)"/>`;

  document.getElementById('avatarModal').classList.add('show');
}

function selectPresetAvatar(avatar, btn) {
  pendingAvatar = avatar;
  document.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    pendingAvatar = ev.target.result;
    document.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('avatarUploadArea').innerHTML = `
      <img src="${pendingAvatar}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" alt="preview"/>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Image selected</div>`;
  };
  reader.readAsDataURL(file);
}

function confirmAvatar() {
  if (avatarTargetIndex === null || !pendingAvatar) return;
  state.players[avatarTargetIndex].avatar = pendingAvatar;
  saveState();
  render();
  closeAvatarModal();
}

function closeAvatarModal() {
  document.getElementById('avatarModal').classList.remove('show');
  avatarTargetIndex = null;
  pendingAvatar     = null;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 2600);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function initials(name) {
  return (name || '?').trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
render();
