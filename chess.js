/* ══════════════════════════════════════════
   Chess — Game Hub  |  chess.js
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

// ── Piece constants ───────────────────────────────────────────────────────────
const UNICODE = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
};

const PIECE_VALS = { P:1, N:3, B:3, R:5, Q:9, K:0 };

// ── Board setup ───────────────────────────────────────────────────────────────
function startBoard() {
  const B = Array.from({length:8}, () => Array(8).fill(null));
  const order = ['R','N','B','Q','K','B','N','R'];
  for (let c = 0; c < 8; c++) {
    B[0][c] = {color:'b', type:order[c]};
    B[1][c] = {color:'b', type:'P'};
    B[6][c] = {color:'w', type:'P'};
    B[7][c] = {color:'w', type:order[c]};
  }
  return B;
}

// ── Game state ────────────────────────────────────────────────────────────────
let board, turn, selected, legalMoves, gameOver;
let enPassantTarget;
let castlingRights;
let capturedByW, capturedByB;
let moveHistory;
let stateHistory;
let scores = { w:0, b:0 };
let lastFrom, lastTo;
let pendingPromo = null;

// ── Coordinate labels ─────────────────────────────────────────────────────────
function buildCoords() {
  const ranks = document.getElementById('coordRanks');
  const files = document.getElementById('coordFiles');
  ranks.innerHTML = [8,7,6,5,4,3,2,1].map(n => `<span>${n}</span>`).join('');
  files.innerHTML = ['a','b','c','d','e','f','g','h'].map(f => `<span>${f}</span>`).join('');
}

// ── New game ──────────────────────────────────────────────────────────────────
function newGame() {
  board           = startBoard();
  turn            = 'w';
  selected        = null;
  legalMoves      = [];
  gameOver        = false;
  enPassantTarget = null;
  castlingRights  = { wK:true, wQ:true, bK:true, bQ:true };
  capturedByW     = [];
  capturedByB     = [];
  moveHistory     = [];
  stateHistory    = [];
  lastFrom        = null;
  lastTo          = null;
  pendingPromo    = null;

  document.getElementById('overlay').classList.remove('show');
  document.getElementById('promoModal').classList.remove('show');
  document.getElementById('undoBtn').disabled = true;

  buildCoords();
  renderBoard();
  updateStatus();
  updateBanners();
  renderMoveList();
  renderCaptured();
}

// ── Render board ──────────────────────────────────────────────────────────────
function renderBoard() {
  const el = document.getElementById('board');
  el.innerHTML = '';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className = 'sq ' + (isLight ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;

      if (lastFrom && lastFrom.r === r && lastFrom.c === c) sq.classList.add('last-from');
      if (lastTo   && lastTo.r   === r && lastTo.c   === c) sq.classList.add('last-to');
      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');

      const isLegal = legalMoves.some(m => m.r === r && m.c === c);
      if (isLegal) {
        sq.classList.add('movable');
        if (board[r][c]) sq.classList.add('has-piece');
      }

      if (!gameOver && board[r][c]?.type === 'K' && board[r][c].color === turn) {
        if (isInCheck(board, turn, enPassantTarget, castlingRights)) {
          sq.classList.add('in-check');
        }
      }

      const piece = board[r][c];
      if (piece) {
        const p = document.createElement('span');
        p.className = 'piece';
        p.textContent = UNICODE[piece.color + piece.type];
        sq.appendChild(p);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      el.appendChild(sq);
    }
  }
}

// ── Square click ──────────────────────────────────────────────────────────────
function onSquareClick(r, c) {
  if (gameOver || (isAI && turn === 'b')) return;

  const piece = board[r][c];

  if (selected) {
    if (legalMoves.some(m => m.r === r && m.c === c)) {
      makeMove(selected.r, selected.c, r, c);
    } else if (piece && piece.color === turn) {
      selected   = { r, c };
      legalMoves = getLegalMoves(board, r, c, turn, enPassantTarget, castlingRights);
      renderBoard();
    } else {
      selected   = null;
      legalMoves = [];
      renderBoard();
    }
  } else {
    if (piece && piece.color === turn) {
      selected   = { r, c };
      legalMoves = getLegalMoves(board, r, c, turn, enPassantTarget, castlingRights);
      renderBoard();
    }
  }
}

// ── Make move ─────────────────────────────────────────────────────────────────
function makeMove(fr, fc, tr, tc, promoType) {
  stateHistory.push(snapshotState());
  document.getElementById('undoBtn').disabled = false;

  const piece    = board[fr][fc];
  const target   = board[tr][tc];
  const newBoard = cloneBoard(board);
  let newEP      = null;
  const newCR    = { ...castlingRights };
  let moveStr    = '';
  let captured   = null;

  // En passant capture
  let epCapture = false;
  if (piece.type === 'P' && enPassantTarget && tr === enPassantTarget.r && tc === enPassantTarget.c) {
    captured = newBoard[fr][tc];
    newBoard[fr][tc] = null;
    epCapture = true;
  }

  // Standard capture
  if (!epCapture && target) captured = target;

  if (captured) {
    if (turn === 'w') capturedByW.push(captured);
    else              capturedByB.push(captured);
  }

  // Castling
  let castled = '';
  if (piece.type === 'K' && Math.abs(tc - fc) === 2) {
    if (tc > fc) { newBoard[fr][5] = newBoard[fr][7]; newBoard[fr][7] = null; castled = 'O-O'; }
    else         { newBoard[fr][3] = newBoard[fr][0]; newBoard[fr][0] = null; castled = 'O-O-O'; }
  }

  // Update castling rights
  if (piece.type === 'K') {
    if (turn === 'w') { newCR.wK = false; newCR.wQ = false; }
    else              { newCR.bK = false; newCR.bQ = false; }
  }
  if (piece.type === 'R') {
    if (fr === 7 && fc === 7) newCR.wK = false;
    if (fr === 7 && fc === 0) newCR.wQ = false;
    if (fr === 0 && fc === 7) newCR.bK = false;
    if (fr === 0 && fc === 0) newCR.bQ = false;
  }
  if (tr === 7 && tc === 7) newCR.wK = false;
  if (tr === 7 && tc === 0) newCR.wQ = false;
  if (tr === 0 && tc === 7) newCR.bK = false;
  if (tr === 0 && tc === 0) newCR.bQ = false;

  // En passant target
  if (piece.type === 'P' && Math.abs(tr - fr) === 2) newEP = { r:(fr+tr)/2, c:fc };

  // Move piece
  newBoard[tr][tc] = piece;
  newBoard[fr][fc] = null;

  // Promotion
  const isPromo = piece.type === 'P' && (tr === 0 || tr === 7);
  if (isPromo) {
    if (!promoType) {
      // Show modal and wait for choice
      stateHistory.pop();
      document.getElementById('undoBtn').disabled = stateHistory.length === 0;
      board = newBoard;
      enPassantTarget = newEP;
      castlingRights  = newCR;
      lastFrom = { r:fr, c:fc };
      lastTo   = { r:tr, c:tc };
      renderBoard();
      showPromoModal(fr, fc, tr, tc);
      return;
    }
    newBoard[tr][tc] = { color: piece.color, type: promoType };
  }

  // Build notation
  if (castled) {
    moveStr = castled;
  } else {
    const files = 'abcdefgh';
    const to    = files[tc] + (8 - tr);
    let pStr    = piece.type === 'P' ? '' : piece.type;
    if (captured || epCapture) pStr += (piece.type === 'P' ? files[fc] : '') + 'x';
    moveStr = pStr + to;
    if (isPromo && promoType) moveStr += '=' + promoType;
  }

  // Commit state
  board           = newBoard;
  enPassantTarget = newEP;
  castlingRights  = newCR;
  lastFrom        = { r:fr, c:fc };
  lastTo          = { r:tr, c:tc };
  selected        = null;
  legalMoves      = [];

  const opp      = turn === 'w' ? 'b' : 'w';
  const oppMoves = getAllLegalMoves(board, opp, enPassantTarget, castlingRights);
  const inChk    = isInCheck(board, opp, enPassantTarget, castlingRights);

  if (inChk)  moveStr += oppMoves.length === 0 ? '#' : '+';

  moveHistory.push(moveStr);
  turn = opp;

  renderBoard();
  updateStatus();
  updateBanners();
  renderMoveList();
  renderCaptured();

  if (oppMoves.length === 0) {
    gameOver = true;
    setTimeout(() => {
      if (inChk) showEndOverlay('checkmate', turn === 'b' ? 'w' : 'b');
      else       showEndOverlay('stalemate', null);
    }, 400);
    return;
  }

  // Trigger AI
  if (isAI && turn === 'b' && !gameOver) {
    setTimeout(doAIMove, 480);
  }
}

// ── Promotion modal ───────────────────────────────────────────────────────────
function showPromoModal(fr, fc, tr, tc) {
  pendingPromo = { fr, fc, tr, tc };
  const color  = tr === 0 ? 'b' : 'w';
  const pieces = ['Q','R','B','N'];
  document.getElementById('promoPieces').innerHTML = pieces.map(t =>
    `<button class="promo-btn" onclick="choosePromo('${t}')">${UNICODE[color + t]}</button>`
  ).join('');
  document.getElementById('promoModal').classList.add('show');
}

function choosePromo(type) {
  document.getElementById('promoModal').classList.remove('show');
  if (!pendingPromo) return;
  const { fr, fc, tr, tc } = pendingPromo;
  pendingPromo = null;
  makeMove(fr, fc, tr, tc, type);
}

// ── Legal move generation ─────────────────────────────────────────────────────
function getLegalMoves(brd, r, c, color, ep, cr) {
  const pseudo = getPseudoMoves(brd, r, c, color, ep, cr);
  return pseudo.filter(m => {
    const tmp   = cloneBoard(brd);
    const piece = tmp[r][c];
    // En passant removal
    if (piece.type === 'P' && ep && m.r === ep.r && m.c === ep.c) tmp[r][m.c] = null;
    // Castling rook
    if (piece.type === 'K' && Math.abs(m.c - c) === 2) {
      if (m.c > c) { tmp[r][5] = tmp[r][7]; tmp[r][7] = null; }
      else         { tmp[r][3] = tmp[r][0]; tmp[r][0] = null; }
    }
    tmp[m.r][m.c] = piece;
    tmp[r][c]     = null;
    return !isInCheck(tmp, color, null, cr);
  });
}

function getAllLegalMoves(brd, color, ep, cr) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (brd[r][c]?.color === color) {
        getLegalMoves(brd, r, c, color, ep, cr).forEach(m => moves.push({ fr:r, fc:c, ...m }));
      }
    }
  }
  return moves;
}

function getPseudoMoves(brd, r, c, color, ep, cr) {
  const piece = brd[r][c];
  if (!piece || piece.color !== color) return [];
  const opp   = color === 'w' ? 'b' : 'w';
  const moves = [];

  const add = (r2, c2) => {
    if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) return false;
    if (brd[r2][c2]?.color === color) return false;
    moves.push({ r:r2, c:c2 });
    return brd[r2][c2] === null;
  };
  const slide = (dr, dc) => { let rr = r+dr, cc = c+dc; while (add(rr, cc)) { rr+=dr; cc+=dc; } };

  switch (piece.type) {
    case 'P': {
      const dir       = color === 'w' ? -1 : 1;
      const startRank = color === 'w' ? 6 : 1;
      if (r+dir >= 0 && r+dir <= 7 && !brd[r+dir][c]) {
        moves.push({ r:r+dir, c });
        if (r === startRank && !brd[r+2*dir][c]) moves.push({ r:r+2*dir, c });
      }
      for (const dc of [-1, 1]) {
        const nr = r+dir, nc = c+dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        if (brd[nr][nc]?.color === opp) moves.push({ r:nr, c:nc });
        if (ep && nr === ep.r && nc === ep.c) moves.push({ r:nr, c:nc });
      }
      break;
    }
    case 'N':
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => add(r+dr, c+dc));
      break;
    case 'B':
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr, dc));
      break;
    case 'R':
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr, dc));
      break;
    case 'Q':
      [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr, dc));
      break;
    case 'K': {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => add(r+dr, c+dc));
      const row = color === 'w' ? 7 : 0;
      if (r === row && c === 4) {
        const ks = color === 'w' ? cr.wK : cr.bK;
        const qs = color === 'w' ? cr.wQ : cr.bQ;
        if (ks && !brd[row][5] && !brd[row][6] &&
            !isSquareAttacked(brd, row, 4, opp) &&
            !isSquareAttacked(brd, row, 5, opp) &&
            !isSquareAttacked(brd, row, 6, opp)) moves.push({ r:row, c:6 });
        if (qs && !brd[row][3] && !brd[row][2] && !brd[row][1] &&
            !isSquareAttacked(brd, row, 4, opp) &&
            !isSquareAttacked(brd, row, 3, opp) &&
            !isSquareAttacked(brd, row, 2, opp)) moves.push({ r:row, c:2 });
      }
      break;
    }
  }
  return moves;
}

// ── Check detection ───────────────────────────────────────────────────────────
function isInCheck(brd, color, ep, cr) {
  let kr = -1, kc = -1;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (brd[r][c]?.color === color && brd[r][c]?.type === 'K') { kr = r; kc = c; }
  }
  if (kr === -1) return false;
  return isSquareAttacked(brd, kr, kc, color === 'w' ? 'b' : 'w');
}

function isSquareAttacked(brd, tr, tc, byColor) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (brd[r][c]?.color !== byColor) continue;
    if (getAttackSquares(brd, r, c, byColor).some(m => m.r === tr && m.c === tc)) return true;
  }
  return false;
}

function getAttackSquares(brd, r, c, color) {
  const piece = brd[r][c];
  if (!piece) return [];
  const moves = [];
  const tryAdd = (r2, c2) => {
    if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) return false;
    if (brd[r2][c2]?.color === color) return false;
    moves.push({ r:r2, c:c2 });
    return brd[r2][c2] === null;
  };
  const slide = (dr, dc) => { let rr = r+dr, cc = c+dc; while (tryAdd(rr, cc)) { rr+=dr; cc+=dc; } };

  switch (piece.type) {
    case 'P': {
      const dir = color === 'w' ? -1 : 1;
      for (const dc of [-1, 1]) { const nr = r+dir, nc = c+dc; if (nr>=0&&nr<=7&&nc>=0&&nc<=7) moves.push({r:nr,c:nc}); }
      break;
    }
    case 'N': [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => tryAdd(r+dr, c+dc)); break;
    case 'B': [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr, dc)); break;
    case 'R': [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr, dc)); break;
    case 'Q': [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr, dc)); break;
    case 'K': [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => tryAdd(r+dr, c+dc)); break;
  }
  return moves;
}

// ── Undo ──────────────────────────────────────────────────────────────────────
function undoMove() {
  if (!stateHistory.length) return;
  restoreState(stateHistory.pop());
  document.getElementById('undoBtn').disabled = stateHistory.length === 0;
  document.getElementById('overlay').classList.remove('show');
  gameOver = false;
  renderBoard();
  updateStatus();
  updateBanners();
  renderMoveList();
  renderCaptured();
}

function snapshotState() {
  return {
    board:          cloneBoard(board),
    turn,
    enPassantTarget: enPassantTarget ? { ...enPassantTarget } : null,
    castlingRights:  { ...castlingRights },
    capturedByW:    [...capturedByW],
    capturedByB:    [...capturedByB],
    moveHistory:    [...moveHistory],
    lastFrom:       lastFrom ? { ...lastFrom } : null,
    lastTo:         lastTo   ? { ...lastTo }   : null,
  };
}

function restoreState(s) {
  board           = s.board;
  turn            = s.turn;
  selected        = null;
  legalMoves      = [];
  enPassantTarget = s.enPassantTarget;
  castlingRights  = s.castlingRights;
  capturedByW     = s.capturedByW;
  capturedByB     = s.capturedByB;
  moveHistory     = s.moveHistory;
  lastFrom        = s.lastFrom;
  lastTo          = s.lastTo;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function cloneBoard(brd) {
  return brd.map(row => row.map(sq => sq ? { ...sq } : null));
}

// ── UI ────────────────────────────────────────────────────────────────────────
function updateStatus() {
  if (gameOver) return;
  const pill  = document.getElementById('statusPill');
  const text  = document.getElementById('statusText');
  const inChk = isInCheck(board, turn, enPassantTarget, castlingRights);
  if (inChk) {
    pill.className   = 'status-pill check';
    text.textContent = (turn === 'w' ? p1Name : p2Name) + ' is in Check!';
  } else if (turn === 'w') {
    pill.className   = 'status-pill turn-p1';
    text.textContent = p1Name + "'s turn (White)";
  } else {
    pill.className   = 'status-pill turn-p2';
    text.textContent = (isAI ? '🤖 ' : '') + p2Name + "'s turn (Black)";
  }
}

function updateBanners(activeTurn = true) {
  const b1 = document.getElementById('bannerP1');
  const b2 = document.getElementById('bannerP2');
  b1.classList.remove('active');
  b2.classList.remove('active');
  if (activeTurn && !gameOver) {
    if (turn === 'w') b1.classList.add('active');
    else              b2.classList.add('active');
  }
  document.getElementById('scoreP1').textContent = scores.w;
  document.getElementById('scoreP2').textContent = scores.b;
}

function renderCaptured() {
  document.getElementById('capturedByW').innerHTML =
    [...capturedByW].sort((a,b) => PIECE_VALS[b.type] - PIECE_VALS[a.type])
    .map(p => `<span class="captured-piece">${UNICODE[p.color + p.type]}</span>`).join('');
  document.getElementById('capturedByB').innerHTML =
    [...capturedByB].sort((a,b) => PIECE_VALS[b.type] - PIECE_VALS[a.type])
    .map(p => `<span class="captured-piece">${UNICODE[p.color + p.type]}</span>`).join('');
}

function renderMoveList() {
  const el = document.getElementById('moveList');
  if (!moveHistory.length) {
    el.innerHTML = '<span class="move-num" style="color:var(--dim);grid-column:1/4;font-size:11px;">No moves yet</span>';
    return;
  }
  let html = '';
  for (let i = 0; i < moveHistory.length; i += 2) {
    const num     = Math.floor(i / 2) + 1;
    const white   = moveHistory[i]   || '';
    const black   = moveHistory[i+1] || '';
    const wLatest = i     === moveHistory.length - 1 ? 'latest' : '';
    const bLatest = i + 1 === moveHistory.length - 1 ? 'latest' : '';
    html += `<span class="move-num">${num}.</span>
             <span class="move-w ${wLatest}">${white}</span>
             <span class="move-b ${bLatest}">${black}</span>`;
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// ── End overlay ───────────────────────────────────────────────────────────────
function showEndOverlay(reason, winner) {
  const emoji = document.getElementById('overlayEmoji');
  const title = document.getElementById('overlayTitle');
  const sub   = document.getElementById('overlaySub');

  if (reason === 'checkmate') {
    const name       = winner === 'w' ? p1Name : p2Name;
    emoji.textContent = '♛';
    title.textContent = name + ' Wins!';
    title.className   = 'overlay-title ' + (winner === 'w' ? 'p1c' : 'p2c');
    sub.textContent   = 'Checkmate — the king has no escape.';
    scores[winner]++;
    saveScoreToHub(winner);
    updateBanners(false);
  } else {
    emoji.textContent = '🤝';
    title.textContent = 'Stalemate!';
    title.className   = 'overlay-title';
    sub.textContent   = 'No legal moves remaining. The game is a draw.';
  }

  document.getElementById('scoreP1').textContent = scores.w;
  document.getElementById('scoreP2').textContent = scores.b;
  setTimeout(() => document.getElementById('overlay').classList.add('show'), 350);
}

// ── Hub score sync ────────────────────────────────────────────────────────────
function saveScoreToHub(winner) {
  try {
    const s = sessionStorage.getItem('gamehub_state');
    if (!s) return;
    const state = JSON.parse(s);
    const idx   = winner === 'w' ? 0 : 1;
    if (state.players[idx]) state.players[idx].score += 10;
    sessionStorage.setItem('gamehub_state', JSON.stringify(state));
  } catch(_) {}
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goBack() { window.location.href = 'index.html'; }

// ── AI ────────────────────────────────────────────────────────────────────────
function doAIMove() {
  if (gameOver || turn !== 'b') return;
  const move = getBestMove();
  if (move) makeMove(move.fr, move.fc, move.r, move.c, move.promo);
}

function getBestMove() {
  const moves = getAllLegalMoves(board, 'b', enPassantTarget, castlingRights);
  if (!moves.length) return null;

  if (difficulty === 'easy') {
    const captures = moves.filter(m => board[m.r][m.c]);
    const pool     = Math.random() < 0.4 && captures.length ? captures : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const depth = difficulty === 'normal' ? 2 : 3;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const score = -minimax(m, depth - 1, -Infinity, Infinity, 'w');
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

function minimax(move, depth, alpha, beta, currentTurn) {
  const savedBoard = cloneBoard(board);
  const savedEP    = enPassantTarget ? { ...enPassantTarget } : null;
  const savedCR    = { ...castlingRights };

  const piece = board[move.fr][move.fc];

  // En passant
  if (piece.type === 'P' && enPassantTarget && move.r === enPassantTarget.r && move.c === enPassantTarget.c) {
    board[move.fr][move.c] = null;
  }
  // Castling rook
  if (piece.type === 'K' && Math.abs(move.c - move.fc) === 2) {
    if (move.c > move.fc) { board[move.fr][5] = board[move.fr][7]; board[move.fr][7] = null; }
    else                  { board[move.fr][3] = board[move.fr][0]; board[move.fr][0] = null; }
  }
  // En passant target
  enPassantTarget = (piece.type === 'P' && Math.abs(move.r - move.fr) === 2)
    ? { r:(move.fr + move.r) / 2, c:move.fc } : null;

  // Castling rights
  if (piece.type === 'K') {
    if (currentTurn === 'w') { castlingRights.wK = false; castlingRights.wQ = false; }
    else                     { castlingRights.bK = false; castlingRights.bQ = false; }
  }

  board[move.r][move.c]   = move.promo ? { color: piece.color, type: move.promo } : piece;
  board[move.fr][move.fc] = null;

  const opp      = currentTurn === 'w' ? 'b' : 'w';
  const oppMoves = getAllLegalMoves(board, opp, enPassantTarget, castlingRights);

  let score;
  if (depth === 0 || !oppMoves.length) {
    score = evaluateBoard();
    if (currentTurn === 'w') score = -score;
  } else {
    score = -Infinity;
    for (const m of oppMoves) {
      const s = -minimax(m, depth - 1, -beta, -alpha, opp);
      if (s > score) score = s;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
  }

  // Restore
  board.forEach((row, r) => row.forEach((_, c) => { board[r][c] = savedBoard[r][c]; }));
  enPassantTarget = savedEP;
  castlingRights  = savedCR;
  return score;
}

function evaluateBoard() {
  const VALUES     = { P:100, N:320, B:330, R:500, Q:900, K:20000 };
  const PAWN_TABLE = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ];
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sign = p.color === 'b' ? 1 : -1;
      score += sign * (VALUES[p.type] || 0);
      if (p.type === 'P') {
        const ti = p.color === 'b' ? r * 8 + c : (7 - r) * 8 + c;
        score += sign * PAWN_TABLE[ti];
      }
    }
  }
  return score;
}

// ── Start ─────────────────────────────────────────────────────────────────────
newGame();