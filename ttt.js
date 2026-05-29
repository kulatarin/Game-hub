// ── Load hub state ──────────────────────────
  let hubState = null;
  try {
    const s = sessionStorage.getItem('gamehub_state');
    if (s) hubState = JSON.parse(s);
  } catch(_) {}

  const p1Name = hubState?.players?.[0]?.name || 'Player 1';
  const p2Name = hubState?.players?.[1]?.name || 'Player 2';

  // ── Game state ──────────────────────────────
  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6]          // diags
  ];

  let board        = Array(9).fill(null);
  let currentMark  = 'x';  // 'x' = p1, 'o' = p2
  let gameOver     = false;
  let scores       = { x: 0, o: 0 };
  let roundHistory = [];

  // ── Init UI ─────────────────────────────────
  document.getElementById('nameP1').textContent = p1Name;
  document.getElementById('nameP2').textContent = p2Name;
  updateStatus();

  // ── Cell click ──────────────────────────────
  function cellClick(i) {
    if (gameOver || board[i]) return;
    board[i] = currentMark;

    const cell = document.querySelector(`.cell[data-i="${i}"]`);
    cell.classList.add(currentMark, 'taken');

    const winner = checkWin();
    if (winner) {
      endGame(winner);
    } else if (board.every(c => c)) {
      endGame(null); // draw
    } else {
      currentMark = currentMark === 'x' ? 'o' : 'x';
      updateStatus();
      updateBanners();
    }
  }

  // ── Check win ───────────────────────────────
  function checkWin() {
    for (const [a,b,c] of WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return { mark: board[a], line: [a,b,c] };
      }
    }
    return null;
  }

  // ── End game ────────────────────────────────
  function endGame(result) {
    gameOver = true;

    if (result) {
      // Highlight winning cells
      result.line.forEach(i => {
        document.querySelector(`.cell[data-i="${i}"]`).classList.add('win-cell');
      });
      drawWinLine(result.line);

      scores[result.mark]++;
      document.getElementById('scoreP1').textContent = scores.x;
      document.getElementById('scoreP2').textContent = scores.o;

      // Persist to hub
      saveScoreToHub(result.mark);

      const winnerName = result.mark === 'x' ? p1Name : p2Name;
      roundHistory.push({ type: result.mark === 'x' ? 'win-p1' : 'win-p2', label: winnerName[0].toUpperCase() });
      showOverlay(true, result.mark, winnerName);
    } else {
      roundHistory.push({ type: 'draw', label: '=' });
      showOverlay(false, null, null);
    }

    renderHistory();
    updateBanners(false);
  }

  // ── Draw win line ────────────────────────────
  function drawWinLine(line) {
    const svg = document.getElementById('winLineSvg');

    // Map index to grid center (0–2 columns, 0–2 rows)
    const col = i => (i % 3) + 0.5;
    const row = i => Math.floor(i / 3) + 0.5;

    const x1 = col(line[0]), y1 = row(line[0]);
    const x2 = col(line[2]), y2 = row(line[2]);

    svg.innerHTML = `
      <line
        x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
        stroke="#ffb432" stroke-width="0.12"
        stroke-linecap="round" opacity="0.85"
        stroke-dasharray="3" stroke-dashoffset="3"
      >
        <animate attributeName="stroke-dashoffset" from="3" to="0" dur="0.35s" fill="freeze"/>
      </line>`;
  }

  // ── Overlay ──────────────────────────────────
  function showOverlay(isWin, mark, winnerName) {
    const overlay   = document.getElementById('overlay');
    const emoji     = document.getElementById('overlayEmoji');
    const title     = document.getElementById('overlayTitle');
    const sub       = document.getElementById('overlaySub');

    if (isWin) {
      emoji.textContent = '🏆';
      title.textContent = `${winnerName} Wins!`;
      title.className   = `overlay-title ${mark === 'x' ? 'p1c' : 'p2c'}`;
      sub.textContent   = `${mark === 'x' ? p2Name : p1Name} better luck next round!`;
    } else {
      emoji.textContent = '🤝';
      title.textContent = "It's a Draw!";
      title.className   = 'overlay-title';
      sub.textContent   = 'Nobody claimed the board this time.';
    }

    setTimeout(() => overlay.classList.add('show'), 320);
  }

  // ── Update status pill ───────────────────────
  function updateStatus() {
    const pill = document.getElementById('statusPill');
    const text = document.getElementById('statusText');
    if (currentMark === 'x') {
      pill.className = 'status-pill turn-p1';
      text.textContent = `${p1Name}'s turn`;
    } else {
      pill.className = 'status-pill turn-p2';
      text.textContent = `${p2Name}'s turn`;
    }
  }

  // ── Update banners active state ──────────────
  function updateBanners(activeTurn = true) {
    const b1 = document.getElementById('bannerP1');
    const b2 = document.getElementById('bannerP2');
    b1.classList.remove('active');
    b2.classList.remove('active');
    if (activeTurn) {
      if (currentMark === 'x') b1.classList.add('active');
      else b2.classList.add('active');
    }
  }

  // ── Render round history chips ───────────────
  function renderHistory() {
    const el = document.getElementById('historyChips');
    if (!roundHistory.length) {
      el.innerHTML = '<span class="chip" style="color:var(--dim)">No rounds yet</span>';
      return;
    }
    el.innerHTML = roundHistory.map(r =>
      `<span class="chip ${r.type}">${r.label}</span>`
    ).join('');
  }

  // ── Save score back to hub session ───────────
  function saveScoreToHub(winnerMark) {
    try {
      const s = sessionStorage.getItem('gamehub_state');
      if (!s) return;
      const state = JSON.parse(s);
      const idx = winnerMark === 'x' ? 0 : 1;
      if (state.players[idx]) state.players[idx].score += 10;
      sessionStorage.setItem('gamehub_state', JSON.stringify(state));
    } catch(_) {}
  }

  // ── New round ────────────────────────────────
  function newRound() {
    board       = Array(9).fill(null);
    currentMark = 'x';
    gameOver    = false;

    document.querySelectorAll('.cell').forEach(c => {
      c.className = 'cell';
    });
    document.getElementById('winLineSvg').innerHTML = '';
    document.getElementById('overlay').classList.remove('show');

    updateStatus();
    updateBanners();
  }

  // ── Back to hub ──────────────────────────────
  function goBack() {
    window.location.href = 'index.html';
  }