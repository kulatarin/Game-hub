/* ══════════════════════════════════════════
   Checkers — Game Hub  |  checkers.js
   ══════════════════════════════════════════ */

// ── Hub state ─────────────────────────────────────────────────────────────────
let hubState = null;
try { const s = sessionStorage.getItem('gamehub_state'); if (s) hubState = JSON.parse(s); } catch(_) {}

const p1Name = hubState?.players?.[0]?.name || 'Player 1';
const p2Name = hubState?.players?.[1]?.name || 'Player 2';
const isAI   = hubState?.players?.[1]?.isAI || false;
let difficulty = 'easy';

document.getElementById('nameP1').textContent = p1Name;
document.getElementById('nameP2').textContent = isAI ? '🤖 ' + p2Name : p2Name;
if (isAI) document.getElementById('diffBar').style.display = 'flex';

function setDiff(d) {
  difficulty = d;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === d));
}

// ── Constants ─────────────────────────────────────────────────────────────────
// turn: 'r' = red (player 1, moves up), 'b' = black (player 2, moves down)
// piece: { color:'r'|'b', king:bool } | null

// ── Game state ────────────────────────────────────────────────────────────────
let board, turn, selected, validMoves, gameOver;
let mustJumpFrom;   // if mid-chain jump, lock to this piece
let lastMoves;      // [{r,c}] last move path for highlight
let scores = { r:0, b:0 };

// ── Init ──────────────────────────────────────────────────────────────────────
function newGame() {
  board      = buildStartBoard();
  turn       = 'r';
  selected   = null;
  validMoves = [];
  gameOver   = false;
  mustJumpFrom = null;
  lastMoves    = [];

  document.getElementById('overlay').classList.remove('show');
  renderBoard();
  updateStatus();
  updateBanners();
  updatePieceCounts();
}

function buildStartBoard() {
  const B = Array.from({length:8}, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue; // only dark squares
      if (r < 3) B[r][c] = { color:'b', king:false };
      if (r > 4) B[r][c] = { color:'r', king:false };
    }
  }
  return B;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderBoard() {
  const el = document.getElementById('board');
  el.innerHTML = '';

  const targets = validMoves.map(m => ({ r: m.to.r, c: m.to.c, isJump: m.isJump }));

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className = 'sq ' + (isLight ? 'light' : 'dark');

      // Last move highlight
      if (lastMoves.some(m => m.r === r && m.c === c)) sq.classList.add('last-move');

      // Selected square
      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');

      // Valid move targets
      const target = targets.find(t => t.r === r && t.c === c);
      if (target) {
        sq.classList.add('movable');
        if (target.isJump) sq.classList.add('jump-target');
      }

      // Must-move piece highlight
      if (!selected && mustJumpFrom && mustJumpFrom.r === r && mustJumpFrom.c === c) {
        sq.classList.add('must-move');
      }

      const piece = board[r][c];
      if (piece) {
        const p = document.createElement('div');
        p.className = 'piece ' + piece.color + (piece.king ? ' king' : '');
        if (selected && selected.r === r && selected.c === c) p.classList.add('selected-piece');
        p.addEventListener('click', () => onPieceClick(r, c));
        sq.appendChild(p);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      el.appendChild(sq);
    }
  }
}

// ── Click handlers ────────────────────────────────────────────────────────────
function onPieceClick(r, c) {
  if (gameOver || (isAI && turn === 'b')) return;
  const piece = board[r][c];
  if (!piece || piece.color !== turn) return;

  // If mid-chain jump, only allow the locked piece
  if (mustJumpFrom && (mustJumpFrom.r !== r || mustJumpFrom.c !== c)) return;

  selected   = { r, c };
  validMoves = getMovesForPiece(r, c, board, turn, true);
  renderBoard();
}

function onSquareClick(r, c) {
  if (gameOver || (isAI && turn === 'b')) return;
  if (!selected) return;

  const move = validMoves.find(m => m.to.r === r && m.to.c === c);
  if (!move) {
    // Clicked elsewhere — deselect (unless mid-chain)
    if (!mustJumpFrom) {
      selected   = null;
      validMoves = [];
      renderBoard();
    }
    return;
  }

  executeMove(move);
}

// ── Execute move ──────────────────────────────────────────────────────────────
function executeMove(move) {
  const { from, to, jumped } = move;
  const piece = board[from.r][from.c];

  lastMoves = [from, to];

  // Move piece
  board[to.r][to.c]     = piece;
  board[from.r][from.c] = null;

  // Remove jumped piece
  if (jumped) board[jumped.r][jumped.c] = null;

  // King promotion
  if (piece.color === 'r' && to.r === 0) piece.king = true;
  if (piece.color === 'b' && to.r === 7) piece.king = true;

  selected   = null;
  validMoves = [];

  // Check for chain jump
  if (jumped) {
    const chainJumps = getMovesForPiece(to.r, to.c, board, turn, true).filter(m => m.isJump);
    // Can't chain after king promotion
    const justPromoted = (piece.color === 'r' && to.r === 0) || (piece.color === 'b' && to.r === 7);
    if (chainJumps.length > 0 && !justPromoted) {
      mustJumpFrom = to;
      selected     = to;
      validMoves   = chainJumps;
      renderBoard();
      updatePieceCounts();
      // AI chain jump
      if (isAI && turn === 'b') setTimeout(doAIMove, 400);
      return;
    }
  }

  mustJumpFrom = null;
  turn = turn === 'r' ? 'b' : 'r';

  renderBoard();
  updateStatus();
  updateBanners();
  updatePieceCounts();

  // Check win
  const winner = checkWinner();
  if (winner) {
    gameOver = true;
    setTimeout(() => showEndOverlay(winner), 400);
    return;
  }

  // AI turn
  if (isAI && turn === 'b' && !gameOver) setTimeout(doAIMove, 480);
}

// ── Move generation ───────────────────────────────────────────────────────────
// Returns [{from, to, jumped, isJump}]
function getMovesForPiece(r, c, brd, color, mustJumpOnly) {
  const piece  = brd[r][c];
  if (!piece || piece.color !== color) return [];

  const jumps  = [];
  const moves  = [];
  const dirs   = getDirections(piece);

  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;

    const neighbor = brd[nr][nc];
    if (!neighbor) {
      // Simple move
      moves.push({ from:{r,c}, to:{r:nr, c:nc}, jumped:null, isJump:false });
    } else if (neighbor.color !== color) {
      // Potential jump
      const lr = nr + dr, lc = nc + dc;
      if (lr >= 0 && lr <= 7 && lc >= 0 && lc <= 7 && !brd[lr][lc]) {
        jumps.push({ from:{r,c}, to:{r:lr, c:lc}, jumped:{r:nr, c:nc}, isJump:true });
      }
    }
  }

  // Must-jump rule: if any jump available anywhere, only return jumps
  if (mustJumpOnly) {
    const allJumps = getAllJumps(brd, color);
    if (allJumps.length > 0) return jumps; // only jumps for this piece
  }

  return jumps.length > 0 ? jumps : moves;
}

function getAllMoves(brd, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (brd[r][c]?.color === color) {
        getMovesForPiece(r, c, brd, color, false).forEach(m => moves.push(m));
      }
    }
  }
  // Apply must-jump rule globally
  const jumps = moves.filter(m => m.isJump);
  return jumps.length > 0 ? jumps : moves;
}

function getAllJumps(brd, color) {
  const jumps = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (brd[r][c]?.color === color) {
        const piece = brd[r][c];
        const dirs  = getDirections(piece);
        for (const [dr, dc] of dirs) {
          const nr = r+dr, nc = c+dc;
          const lr = r+2*dr, lc = c+2*dc;
          if (nr<0||nr>7||nc<0||nc>7||lr<0||lr>7||lc<0||lc>7) continue;
          const nb = brd[nr][nc];
          if (nb && nb.color !== color && !brd[lr][lc]) {
            jumps.push({ from:{r,c}, to:{r:lr,c:lc}, jumped:{r:nr,c:nc}, isJump:true });
          }
        }
      }
    }
  }
  return jumps;
}

function getDirections(piece) {
  if (piece.king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
  return piece.color === 'r' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
}

// ── Win check ─────────────────────────────────────────────────────────────────
function checkWinner() {
  const redCount   = countPieces('r');
  const blackCount = countPieces('b');
  if (redCount   === 0) return 'b';
  if (blackCount === 0) return 'r';
  if (getAllMoves(board, turn).length === 0) return turn === 'r' ? 'b' : 'r';
  return null;
}

function countPieces(color) {
  let count = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]?.color === color) count++;
  return count;
}

// ── UI updates ────────────────────────────────────────────────────────────────
function updateStatus() {
  const pill = document.getElementById('statusPill');
  const txt  = document.getElementById('statusText');
  const name = turn === 'r' ? p1Name : (isAI ? '🤖 ' + p2Name : p2Name);

  const jumps = getAllJumps(board, turn);
  if (jumps.length > 0) {
    pill.className   = 'status-pill must-jump';
    txt.textContent  = `${name} must jump!`;
  } else {
    pill.className   = `status-pill turn-p${turn === 'r' ? '1' : '2'}`;
    txt.textContent  = `${name}'s turn`;
  }
}

function updateBanners() {
  const b1 = document.getElementById('bannerP1');
  const b2 = document.getElementById('bannerP2');
  b1.classList.remove('active'); b2.classList.remove('active');
  if (!gameOver) {
    if (turn === 'r') b1.classList.add('active');
    else              b2.classList.add('active');
  }
  document.getElementById('scoreP1').textContent = scores.r;
  document.getElementById('scoreP2').textContent = scores.b;
}

function updatePieceCounts() {
  document.getElementById('piecesP1').textContent = countPieces('r') + ' pieces';
  document.getElementById('piecesP2').textContent = countPieces('b') + ' pieces';
}

// ── End overlay ───────────────────────────────────────────────────────────────
function showEndOverlay(winner) {
  const emoji = document.getElementById('overlayEmoji');
  const title = document.getElementById('overlayTitle');
  const sub   = document.getElementById('overlaySub');
  const name  = winner === 'r' ? p1Name : p2Name;

  emoji.textContent = '🏆';
  title.textContent = name + ' Wins!';
  title.className   = 'overlay-title ' + (winner === 'r' ? 'p1c' : 'p2c');
  sub.textContent   = winner === 'r'
    ? `${p2Name} has no pieces or moves left.`
    : `${p1Name} has no pieces or moves left.`;

  scores[winner]++;
  saveScoreToHub(winner);
  updateBanners();
  document.getElementById('scoreP1').textContent = scores.r;
  document.getElementById('scoreP2').textContent = scores.b;
  setTimeout(() => document.getElementById('overlay').classList.add('show'), 400);
}

// ── Hub score sync ────────────────────────────────────────────────────────────
function saveScoreToHub(winner) {
  try {
    const s = sessionStorage.getItem('gamehub_state');
    if (!s) return;
    const state = JSON.parse(s);
    const idx   = winner === 'r' ? 0 : 1;
    if (state.players[idx]) state.players[idx].score += 10;
    sessionStorage.setItem('gamehub_state', JSON.stringify(state));
  } catch(_) {}
}

// ── AI ────────────────────────────────────────────────────────────────────────
function doAIMove() {
  if (gameOver || turn !== 'b') return;

  const moves = mustJumpFrom
    ? getMovesForPiece(mustJumpFrom.r, mustJumpFrom.c, board, 'b', true).filter(m => m.isJump)
    : getAllMoves(board, 'b');

  if (!moves.length) return;

  let move;
  if (difficulty === 'easy') {
    move = moves[Math.floor(Math.random() * moves.length)];
  } else {
    const depth = difficulty === 'normal' ? 3 : 5;
    move = getBestAIMove(depth);
  }

  if (move) executeMove(move);
}

function getBestAIMove(depth) {
  const moves = getAllMoves(board, 'b');
  if (!moves.length) return null;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const brd = applyMoveToBoard(cloneCheckerBoard(board), m);
    const score = -minimaxCheckers(brd, depth - 1, -Infinity, Infinity, 'r');
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

function minimaxCheckers(brd, depth, alpha, beta, color) {
  const moves = getAllMovesOnBoard(brd, color);
  if (depth === 0 || !moves.length) return evalBoard(brd);

  let best = -Infinity;
  for (const m of moves) {
    const nb    = applyMoveToBoard(cloneCheckerBoard(brd), m);
    const score = -minimaxCheckers(nb, depth - 1, -beta, -alpha, color === 'r' ? 'b' : 'r');
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function evalBoard(brd) {
  let score = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = brd[r][c];
    if (!p) continue;
    const val = p.king ? 3 : 1;
    score += p.color === 'b' ? val : -val;
  }
  return score;
}

function getAllMovesOnBoard(brd, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (brd[r][c]?.color !== color) continue;
      const piece = brd[r][c];
      const dirs  = getDirections(piece);
      // Simple moves
      for (const [dr, dc] of dirs) {
        const nr = r+dr, nc = c+dc;
        if (nr>=0&&nr<=7&&nc>=0&&nc<=7&&!brd[nr][nc]) {
          moves.push({ from:{r,c}, to:{r:nr,c:nc}, jumped:null, isJump:false });
        }
      }
      // Jumps
      for (const [dr, dc] of dirs) {
        const nr=r+dr, nc=c+dc, lr=r+2*dr, lc=c+2*dc;
        if (nr<0||nr>7||nc<0||nc>7||lr<0||lr>7||lc<0||lc>7) continue;
        const nb = brd[nr][nc];
        if (nb && nb.color !== color && !brd[lr][lc]) {
          moves.push({ from:{r,c}, to:{r:lr,c:lc}, jumped:{r:nr,c:nc}, isJump:true });
        }
      }
    }
  }
  const jumps = moves.filter(m => m.isJump);
  return jumps.length > 0 ? jumps : moves;
}

function applyMoveToBoard(brd, move) {
  const { from, to, jumped } = move;
  const piece = { ...brd[from.r][from.c] };
  brd[to.r][to.c]     = piece;
  brd[from.r][from.c] = null;
  if (jumped) brd[jumped.r][jumped.c] = null;
  if (piece.color === 'r' && to.r === 0) piece.king = true;
  if (piece.color === 'b' && to.r === 7) piece.king = true;
  return brd;
}

function cloneCheckerBoard(brd) {
  return brd.map(row => row.map(sq => sq ? { ...sq } : null));
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() { window.location.href = 'index.html'; }

// ── Start ─────────────────────────────────────────────────────────────────────
newGame();