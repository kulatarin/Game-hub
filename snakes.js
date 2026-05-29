/* ══════════════════════════════════════════
   Snakes & Ladders — Game Hub  |  snakes.js
   ══════════════════════════════════════════ */

let hubState = null;
try { const s = sessionStorage.getItem('gamehub_state'); if (s) hubState = JSON.parse(s); } catch(_) {}

const NUM_PLAYERS = Math.min(Math.max(hubState?.players?.length || 2, 2), 4);
const COLS        = ['r','b','g','y'].slice(0, NUM_PLAYERS);
const COLOR_NAMES = { r:'Red', b:'Blue', g:'Green', y:'Yellow' };
const COLOR_CLASS = { r:'cr', b:'cb', g:'cg', y:'cy' };
const ACT_CLASS   = { r:'active-r', b:'active-b', g:'active-g', y:'active-y' };
const DICE_FACES  = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function pName(i) { return hubState?.players?.[i]?.name || `Player ${i+1}`; }
function pIsAI(i) { return hubState?.players?.[i]?.isAI || false; }

// Snakes: [head, tail]  Ladders: [base, top]
const SNAKES  = [[98,40],[84,58],[70,24],[54,34],[48,26],[36,6],[32,10]];
const LADDERS = [[4,56],[9,31],[20,58],[28,84],[40,59],[51,67],[63,81],[71,91]];

const SNAKE_MAP  = Object.fromEntries(SNAKES);
const LADDER_MAP = Object.fromEntries(LADDERS);

// Convert square number (1-100) to [row,col] on a 10×10 boustrophedon grid
// Square 1 = bottom-left, 100 = top-left (zigzag)
function sqToCell(sq) {
  const idx = sq - 1; // 0-based
  const row = Math.floor(idx / 10);       // 0=bottom row
  const col = row % 2 === 0 ? idx % 10 : 9 - (idx % 10);
  return { gridRow: 9 - row, gridCol: col }; // CSS grid row (0=top)
}

// State
let positions, turnIdx, diceRolled, gameOver, scores, logEntries;
scores = { r:0, b:0, g:0, y:0 };

function newGame() {
  positions  = Object.fromEntries(COLS.map(c => [c, 0])); // 0 = off board
  turnIdx    = 0;
  diceRolled = false;
  gameOver   = false;
  logEntries = [];
  document.getElementById('overlay').classList.remove('show');
  renderPlayersGrid();
  buildBoard();
  renderTokens();
  updateStatus();
}

function buildBoard() {
  const board = document.getElementById('snakesBoard');
  board.innerHTML = '';

  // Create 100 cells
  const cells = [];
  for (let sq = 100; sq >= 1; sq--) {
    const { gridRow, gridCol } = sqToCell(sq);
    cells.push({ sq, gridRow, gridCol });
  }

  // Sort by grid position for DOM order (row 0 = top)
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const sq = cells.find(c => c.gridRow === row && c.gridCol === col).sq;
      const el = document.createElement('div');
      el.id = `sq-${sq}`;
      el.className = 'cell' +
        ((9 - row) % 2 === 0 ? ' even-row' : '') +
        (sq === 1   ? ' start-sq' : '') +
        (sq === 100 ? ' end-sq' : '') +
        (SNAKE_MAP[sq]  !== undefined ? ' snake-head' : '') +
        (LADDER_MAP[sq] !== undefined ? ' ladder-base' : '');

      const num = document.createElement('span');
      num.textContent = sq;
      num.style.cssText = 'position:absolute;bottom:2px;right:3px;opacity:0.45;font-size:0.7em;';
      el.appendChild(num);

      if (sq === 1)   { const s = document.createElement('div'); s.textContent='🚩'; s.style.fontSize='1.1em'; el.appendChild(s); }
      if (sq === 100) { const s = document.createElement('div'); s.textContent='🏆'; s.style.fontSize='1.1em'; el.appendChild(s); }
      if (SNAKE_MAP[sq]  !== undefined) { const s = document.createElement('div'); s.textContent='🐍'; s.style.fontSize='1em'; el.appendChild(s); }
      if (LADDER_MAP[sq] !== undefined) { const s = document.createElement('div'); s.textContent='🪜'; s.style.fontSize='1em'; el.appendChild(s); }

      board.appendChild(el);
    }
  }
}

function renderPlayersGrid() {
  document.getElementById('playersGrid').innerHTML = COLS.map((col, i) => {
    const ai = pIsAI(i);
    return `<div class="player-banner" id="banner-${col}">
      <div class="banner-dot ${col}"></div>
      <div class="banner-info">
        <div class="banner-name">${esc(ai ? '🤖 '+pName(i) : pName(i))}</div>
        <div class="banner-sub">${COLOR_NAMES[col]}</div>
      </div>
      <div class="banner-score ${col}" id="bsc-${col}">${scores[col]}</div>
    </div>`;
  }).join('');
}

function renderTokens() {
  // Remove existing tokens
  document.querySelectorAll('.token').forEach(t => t.remove());

  // Group by square
  const bySq = {};
  for (const col of COLS) {
    const sq = positions[col];
    if (sq < 1) continue; // off board
    if (!bySq[sq]) bySq[sq] = [];
    bySq[sq].push(col);
  }

  for (const [sq, cols] of Object.entries(bySq)) {
    const cell = document.getElementById(`sq-${sq}`);
    if (!cell) continue;
    cols.forEach((col, idx) => {
      const t = document.createElement('div');
      t.className = `token ${col} s${idx % 4}`;
      t.textContent = COLS.indexOf(col) + 1;
      cell.appendChild(t);
    });
  }
}

function updateStatus() {
  const col  = COLS[turnIdx];
  const i    = COLS.indexOf(col);
  const name = pIsAI(i) ? '🤖 '+pName(i) : pName(i);
  const pill = document.getElementById('statusPill');
  const txt  = document.getElementById('statusText');
  pill.className = `status-pill turn-${col}`;
  txt.textContent = diceRolled ? 'Moving...' : `${name} — tap 🎲`;
  updateBanners();
}

function updateBanners() {
  for (const col of COLS) {
    const el = document.getElementById(`banner-${col}`);
    if (!el) continue;
    Object.values(ACT_CLASS).forEach(c => el.classList.remove(c));
    if (!gameOver && COLS[turnIdx] === col) el.classList.add(ACT_CLASS[col]);
    const sc = document.getElementById(`bsc-${col}`);
    if (sc) sc.textContent = scores[col];
  }
}

function rollDice() {
  if (diceRolled || gameOver) return;
  const col = COLS[turnIdx];
  const i   = COLS.indexOf(col);
  if (pIsAI(i)) return;
  doRoll();
}

function doRoll() {
  diceRolled = true;
  const val = Math.ceil(Math.random() * 6);
  const el  = document.getElementById('diceDisplay');
  el.classList.add('rolling');
  el.textContent = DICE_FACES[val - 1];
  setTimeout(() => el.classList.remove('rolling'), 420);

  const col  = COLS[turnIdx];
  const i    = COLS.indexOf(col);
  const name = pIsAI(i) ? '🤖 '+pName(i) : pName(i);
  addLog(`${name} rolled a ${val}`);
  updateStatus();

  setTimeout(() => movePlayer(col, val), 500);
}

function movePlayer(col, steps) {
  const i      = COLS.indexOf(col);
  const name   = pIsAI(i) ? '🤖 '+pName(i) : pName(i);
  let pos      = positions[col];
  const newPos = pos + steps;

  if (newPos > 100) {
    // Can't move — need exact roll
    addLog(`${name} needs ${100 - pos} — no move!`);
  } else {
    pos = newPos;
    positions[col] = pos;

    if (SNAKE_MAP[pos] !== undefined) {
      addLog(`${name} hit a snake 🐍! Slid from ${pos} to ${SNAKE_MAP[pos]}`, true);
      setTimeout(() => {
        positions[col] = SNAKE_MAP[pos];
        renderTokens();
        endTurn(col, positions[col]);
      }, 500);
      renderTokens();
      return;
    }
    if (LADDER_MAP[pos] !== undefined) {
      addLog(`${name} climbed a ladder 🪜! Up from ${pos} to ${LADDER_MAP[pos]}`, true);
      setTimeout(() => {
        positions[col] = LADDER_MAP[pos];
        renderTokens();
        endTurn(col, positions[col]);
      }, 500);
      renderTokens();
      return;
    }
  }

  renderTokens();
  endTurn(col, positions[col]);
}

function endTurn(col, finalPos) {
  if (finalPos >= 100) {
    gameOver = true;
    const i = COLS.indexOf(col);
    scores[col]++;
    saveScore(col);
    updateBanners();
    addLog(`${pName(i)} wins! 🏆`, true);
    document.getElementById('overlayEmoji').textContent = '🏆';
    document.getElementById('overlayTitle').textContent = `${pName(i)} Wins!`;
    document.getElementById('overlayTitle').className = `overlay-title ${COLOR_CLASS[col]}`;
    document.getElementById('overlaySub').textContent = `${COLOR_NAMES[col]} reached square 100 first!`;
    setTimeout(() => document.getElementById('overlay').classList.add('show'), 500);
    return;
  }

  diceRolled = false;
  document.getElementById('diceDisplay').textContent = '🎲';
  turnIdx = (turnIdx + 1) % COLS.length;
  updateStatus();

  const nextI = COLS.indexOf(COLS[turnIdx]);
  if (pIsAI(nextI)) setTimeout(doRoll, 800);
}

function saveScore(winCol) {
  try {
    const s = sessionStorage.getItem('gamehub_state'); if (!s) return;
    const st = JSON.parse(s);
    const i  = COLS.indexOf(winCol);
    if (st.players[i]) st.players[i].score += 10;
    sessionStorage.setItem('gamehub_state', JSON.stringify(st));
  } catch(_) {}
}

function addLog(msg, hi = false) {
  logEntries.unshift({ msg, hi });
  if (logEntries.length > 40) logEntries.pop();
  document.getElementById('logWrap').innerHTML =
    logEntries.map(e => `<div class="log-entry${e.hi ? ' highlight' : ''}">${esc(e.msg)}</div>`).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function goBack() { window.location.href = 'index.html'; }

newGame();