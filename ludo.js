/* ══════════════════════════════════════════
   Ludo — Game Hub  |  ludo.js
   ══════════════════════════════════════════ */

// ── Hub state ─────────────────────────────────────────────────────────────────
let hubState = null;
try { const s = sessionStorage.getItem('gamehub_state'); if (s) hubState = JSON.parse(s); } catch(_){}

const NUM_PLAYERS = Math.min(Math.max(hubState?.players?.length || 2, 2), 4);
const COLS        = ['r','b','g','y'].slice(0, NUM_PLAYERS);
const COLOR_NAMES = { r:'Red', b:'Blue', g:'Green', y:'Yellow' };
const COLOR_CLASS = { r:'cr',  b:'cb',   g:'cg',    y:'cy' };
const ACT_CLASS   = { r:'active-r', b:'active-b', g:'active-g', y:'active-y' };
const DICE_FACES  = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function pName(i) { return hubState?.players?.[i]?.name || `Player ${i+1}`; }
function pIsAI(i) { return hubState?.players?.[i]?.isAI || false; }

// ══════════════════════════════════════════════════════════════════════════════
// BOARD DEFINITION
// Standard Ludo 15×15 board. All coordinates are [row, col], 0-indexed.
// ══════════════════════════════════════════════════════════════════════════════

// 52-step clockwise main path starting at Red's entry square
const MAIN_PATH = (function(){
  const p = [];
  for (let r=13;r>=9; r--) p.push([r,6]);   // steps 0-4   (Red entry area, going up)
  for (let c=5; c>=0; c--) p.push([8,c]);   // steps 5-10  (bottom-left row, going left)
  for (let c=0; c<=5; c++) p.push([7,c]);   // steps 11-16 (middle-left row, going right)
  for (let r=6; r>=1; r--) p.push([r,6]);   // steps 17-22 (Blue entry area, going up)
  for (let c=6; c<=8; c++) p.push([0,c]);   // steps 23-25 (top row)
  for (let r=1; r<=6; r++) p.push([r,8]);   // steps 26-31 (Green entry area, going down)
  for (let c=9; c<=14;c++) p.push([6,c]);   // steps 32-37 (top-right row, going right)
  for (let c=14;c>=9; c--) p.push([7,c]);   // steps 38-43 (middle-right row, going left)
  for (let r=8; r<=13;r++) p.push([r,8]);   // steps 44-49 (Yellow entry area, going down)
  for (let c=8; c>=6; c--) p.push([14,c]); // steps 50-52 (bottom row) — gives 53; trim below
  return p.slice(0,52);
})();

// Entry step on MAIN_PATH per colour
const ENTRY = { r:0, b:13, g:26, y:39 };

// Safe squares (cannot be captured here) — step indices on MAIN_PATH
const SAFE = new Set([0,8,13,21,26,34,39,47]);

// Home-stretch: 5 cells per colour leading to centre
const HS = {
  r: [[13,7],[12,7],[11,7],[10,7],[9,7]],
  b: [[7,1],[7,2],[7,3],[7,4],[7,5]],
  g: [[1,7],[2,7],[3,7],[4,7],[5,7]],
  y: [[7,13],[7,12],[7,11],[7,10],[7,9]],
};

// Yard token-slot positions (4 per colour)
const YARD = {
  r: [[11,2],[11,3],[12,2],[12,3]],
  b: [[2,2],[2,3],[3,2],[3,3]],
  g: [[2,11],[2,12],[3,11],[3,12]],
  y: [[11,11],[11,12],[12,11],[12,12]],
};

// Pre-compute a cell-class map for the static board background
function staticCellClass(r, c) {
  // Centre
  if (r===7 && c===7) return 'centre';

  // Home-stretch lanes
  for (const col of ['r','b','g','y']) {
    if (HS[col].some(([hr,hc])=>hr===r&&hc===c)) return `col-${col}`;
  }

  // Main path
  const si = MAIN_PATH.findIndex(([pr,pc])=>pr===r&&pc===c);
  if (si !== -1) {
    // Entry squares
    for (const [col, es] of Object.entries(ENTRY)) {
      if (si === es) return `entry-${col} path`;
    }
    return SAFE.has(si) ? 'safe path' : 'path';
  }

  // Yard circles (inner token-resting spots)
  for (const col of ['r','b','g','y']) {
    if (YARD[col].some(([yr,yc])=>yr===r&&yc===c)) return `home-${col} yard-circle`;
  }

  // Yard region fill  (6×6 corner blocks minus path and centre corridor)
  if (r<=5  && c<=5)  return 'home-b';
  if (r<=5  && c>=9)  return 'home-g';
  if (r>=9  && c<=5)  return 'home-r';
  if (r>=9  && c>=9)  return 'home-y';

  // The cross corridors that aren't path yet (border cells)
  return 'path';
}

// ── Game state ─────────────────────────────────────────────────────────────────
// Token: { id, yard, step, hs, done }
//   yard → in home base
//   step → 0-51 main path index (when !yard && !hs && !done)
//   hs   → home-stretch step 0-4 (true when in home stretch)
//   done → finished

let tokens, turnIdx, diceVal, diceRolled, selectedToken, gameOver, lastRoll;
let scores = { r:0, b:0, g:0, y:0 };
let logEntries = [];

// ── New game ───────────────────────────────────────────────────────────────────
function newGame() {
  gameOver = false; turnIdx = 0;
  diceVal = null; diceRolled = false; selectedToken = null;
  lastRoll = 0; logEntries = [];

  tokens = {};
  for (const col of COLS) {
    tokens[col] = [0,1,2,3].map(id=>({ id, yard:true, step:-1, hs:false, done:false }));
  }

  document.getElementById('overlay').classList.remove('show');
  renderPlayersGrid();
  buildBoardDOM();
  renderAll();
  updateStatus();

  if (pIsAI(0)) setTimeout(aiTurn, 800);
}

// ── Build static 15×15 board ───────────────────────────────────────────────────
function buildBoardDOM() {
  const board = document.getElementById('ludoBoard');
  board.innerHTML = '';
  for (let r=0; r<15; r++) {
    for (let c=0; c<15; c++) {
      const el = document.createElement('div');
      el.id = `lc-${r}-${c}`;
      el.className = 'lc ' + staticCellClass(r,c);
      if (r===7 && c===7) el.textContent = '🏠';
      board.appendChild(el);
    }
  }
}

// ── Render tokens + highlights ─────────────────────────────────────────────────
function renderAll() {
  document.querySelectorAll('.token').forEach(t=>t.remove());
  document.querySelectorAll('.lc.can-move').forEach(el=>el.classList.remove('can-move'));

  // Track how many tokens are already placed in each cell (for stacking offsets)
  const cellCount = {};
  for (const col of COLS) {
    for (const tok of tokens[col]) {
      if (tok.done) continue;
      const [r,c] = tokCell(col,tok);
      const key = `${r}-${c}`;
      const idx = cellCount[key] = (cellCount[key]||0);
      placeTokenDOM(col, tok.id, r, c, idx);
      cellCount[key]++;
    }
  }

  // Highlight cells where current player can move
  if (diceRolled && !gameOver) {
    const col = COLS[turnIdx];
    for (const tok of movable(col)) {
      const [r,c] = tokCell(col,tok);
      const el = document.getElementById(`lc-${r}-${c}`);
      if (el) el.classList.add('can-move');
    }
  }
}

function tokCell(col, tok) {
  if (tok.yard) return YARD[col][tok.id];
  if (tok.hs)   return HS[col][tok.step];
  return MAIN_PATH[tok.step];
}

function placeTokenDOM(col, id, r, c, stackIdx) {
  const cell = document.getElementById(`lc-${r}-${c}`);
  if (!cell) return;
  const t = document.createElement('div');
  t.className = `token ${col} s${stackIdx%4}`;
  t.dataset.col = col; t.dataset.id = id;
  t.textContent = id+1;
  if (selectedToken?.color===col && selectedToken?.idx===id) t.classList.add('selected');
  t.addEventListener('click', ()=>onTokenClick(col,id));
  cell.appendChild(t);
}

// ── Player banners ─────────────────────────────────────────────────────────────
function renderPlayersGrid() {
  document.getElementById('playersGrid').innerHTML = COLS.map((col,i)=>{
    const ai = pIsAI(i);
    return `<div class="player-banner" id="banner-${col}">
      <div class="banner-dot ${col}"></div>
      <div class="banner-info">
        <div class="banner-name">${esc(ai?'🤖 '+pName(i):pName(i))}</div>
        <div class="banner-sub">${COLOR_NAMES[col]}</div>
      </div>
      <div class="banner-score ${col}" id="bsc-${col}">${scores[col]}</div>
    </div>`;
  }).join('');
}

function updateBanners() {
  for (const col of COLS) {
    const el = document.getElementById(`banner-${col}`);
    if (!el) continue;
    Object.values(ACT_CLASS).forEach(c=>el.classList.remove(c));
    if (!gameOver && COLS[turnIdx]===col) el.classList.add(ACT_CLASS[col]);
    const sc = document.getElementById(`bsc-${col}`);
    if (sc) sc.textContent = scores[col];
  }
}

function updateStatus() {
  const col  = COLS[turnIdx];
  const i    = COLS.indexOf(col);
  const name = pIsAI(i) ? '🤖 '+pName(i) : pName(i);
  const pill = document.getElementById('statusPill');
  const txt  = document.getElementById('statusText');
  pill.className = `status-pill turn-${col}`;
  if (!diceRolled) {
    txt.textContent = `${name} — tap 🎲`;
  } else {
    const mv = movable(col);
    txt.textContent = mv.length ? `Rolled ${diceVal} — pick a token` : `Rolled ${diceVal} — no moves`;
  }
  updateBanners();
}

// ── Dice ───────────────────────────────────────────────────────────────────────
function rollDice() {
  const col = COLS[turnIdx];
  if (diceRolled || gameOver || pIsAI(COLS.indexOf(col))) return;
  doRoll();
}

function doRoll() {
  lastRoll = Math.ceil(Math.random()*6);
  diceVal  = lastRoll;
  diceRolled = true;
  const el = document.getElementById('diceDisplay');
  el.classList.add('rolling');
  el.textContent = DICE_FACES[diceVal-1];
  setTimeout(()=>el.classList.remove('rolling'), 420);

  const col = COLS[turnIdx];
  const i   = COLS.indexOf(col);
  addLog(`${pName(i)} rolled a ${diceVal}`);

  const mv = movable(col);
  if (!mv.length) {
    addLog('No valid moves — skipping');
    renderAll(); updateStatus();
    setTimeout(nextTurn, 1000);
    return;
  }
  if (mv.length === 1) {
    renderAll(); updateStatus();
    setTimeout(()=>doMove(col, mv[0].id), 350);
    return;
  }
  renderAll(); updateStatus();
  if (pIsAI(i)) setTimeout(()=>aiPick(col), 550);
}

// ── Token interaction ──────────────────────────────────────────────────────────
function onTokenClick(col, id) {
  if (gameOver || !diceRolled) return;
  if (col !== COLS[turnIdx]) return;
  if (pIsAI(COLS.indexOf(col))) return;
  if (!movable(col).find(t=>t.id===id)) return;
  selectedToken = { color:col, idx:id };
  renderAll();
  setTimeout(()=>doMove(col,id), 180);
}

// ── Move logic ─────────────────────────────────────────────────────────────────
function movable(col) {
  return tokens[col].filter(tok=>canMove(col,tok));
}

function canMove(col, tok) {
  if (tok.done) return false;
  if (tok.yard) return diceVal===6;
  if (tok.hs)   return tok.step + diceVal <= 4;
  const prog = (tok.step - ENTRY[col] + 52) % 52;
  return prog + diceVal <= 56;
}

function doMove(col, id) {
  selectedToken = null;
  const tok  = tokens[col].find(t=>t.id===id);
  const i    = COLS.indexOf(col);
  const name = pName(i);
  const was6 = lastRoll===6;

  if (tok.yard) {
    tok.yard = false; tok.step = ENTRY[col];
    addLog(`${name}'s ${id+1} entered the board!`, true);

  } else if (tok.hs) {
    tok.step += diceVal;
    if (tok.step >= 4) { tok.step=4; tok.done=true; addLog(`${name}'s ${id+1} reached HOME! 🎉`, true); }
    else addLog(`${name}'s ${id+1} advanced in home stretch`);

  } else {
    const prog    = (tok.step - ENTRY[col] + 52) % 52;
    const newProg = prog + diceVal;
    if (newProg >= 52) {
      tok.hs   = true;
      tok.step = newProg-52;
      if (tok.step>=4) { tok.step=4; tok.done=true; addLog(`${name}'s ${id+1} reached HOME! 🎉`, true); }
      else addLog(`${name}'s ${id+1} entered home stretch`);
    } else {
      tok.step = (ENTRY[col] + newProg) % 52;
      addLog(`${name}'s ${id+1} moved`);
      checkCapture(col, tok);
    }
  }

  if (checkWin(col)) return;

  diceRolled=false; diceVal=null;
  document.getElementById('diceDisplay').textContent='🎲';
  renderAll();

  if (was6) {
    addLog(`${name} rolls again!`);
    updateStatus();
    if (pIsAI(i)) setTimeout(aiTurn,700);
  } else {
    nextTurn();
  }
}

function checkCapture(col, tok) {
  if (tok.done||tok.yard||tok.hs) return;
  const step = tok.step;
  if (SAFE.has(step)) return;
  if (Object.values(ENTRY).includes(step)) return;
  const [tr,tc] = MAIN_PATH[step];
  for (const oc of COLS) {
    if (oc===col) continue;
    for (const ot of tokens[oc]) {
      if (ot.done||ot.yard||ot.hs) continue;
      const [or,oo] = MAIN_PATH[ot.step];
      if (or===tr && oo===tc) {
        ot.yard=true; ot.step=-1; ot.hs=false;
        addLog(`${pName(COLS.indexOf(col))} captured ${pName(COLS.indexOf(oc))}'s token!`, true);
      }
    }
  }
}

function checkWin(col) {
  if (!tokens[col].every(t=>t.done)) return false;
  gameOver=true;
  scores[col]++;
  saveScore(col);
  diceRolled=false; diceVal=null;
  renderAll(); updateBanners();
  const i = COLS.indexOf(col);
  addLog(`${pName(i)} wins! 🏆`, true);
  document.getElementById('overlayEmoji').textContent='🏆';
  document.getElementById('overlayTitle').textContent=`${pName(i)} Wins!`;
  document.getElementById('overlayTitle').className=`overlay-title ${COLOR_CLASS[col]}`;
  document.getElementById('overlaySub').textContent=`${COLOR_NAMES[col]} got all tokens home first!`;
  setTimeout(()=>document.getElementById('overlay').classList.add('show'), 500);
  return true;
}

// ── Turns ──────────────────────────────────────────────────────────────────────
function nextTurn() {
  turnIdx=(turnIdx+1)%COLS.length;
  diceRolled=false; diceVal=null; selectedToken=null;
  document.getElementById('diceDisplay').textContent='🎲';
  renderAll(); updateStatus();
  if (pIsAI(COLS.indexOf(COLS[turnIdx]))) setTimeout(aiTurn,700);
}

// ── AI ─────────────────────────────────────────────────────────────────────────
function aiTurn() {
  if (gameOver) return;
  const col = COLS[turnIdx];
  if (!pIsAI(COLS.indexOf(col))) return;
  doRoll();
}

function aiPick(col) {
  const mv = movable(col);
  if (!mv.length) return;
  let best=mv[0], bestSc=-Infinity;
  for (const tok of mv) {
    let sc=0;
    if (tok.yard) sc=5;
    else if (tok.hs) sc=60+tok.step;
    else {
      const prog=(tok.step-ENTRY[col]+52)%52;
      sc=10+prog;
      // bonus for capture
      const np=prog+diceVal;
      if (np<52) {
        const ns=(ENTRY[col]+np)%52;
        const [nr,nc]=MAIN_PATH[ns];
        if (!SAFE.has(ns) && !Object.values(ENTRY).includes(ns)) {
          for (const oc of COLS) {
            if (oc===col) continue;
            for (const ot of tokens[oc]) {
              if (!ot.yard&&!ot.hs&&!ot.done) {
                const [or,oo]=MAIN_PATH[ot.step];
                if (or===nr&&oo===nc) sc+=35;
              }
            }
          }
        }
      }
    }
    if (sc>bestSc) { bestSc=sc; best=tok; }
  }
  doMove(col, best.id);
}

// ── Hub score ──────────────────────────────────────────────────────────────────
function saveScore(winCol) {
  try {
    const s=sessionStorage.getItem('gamehub_state'); if(!s)return;
    const st=JSON.parse(s);
    const i=COLS.indexOf(winCol);
    if (st.players[i]) st.players[i].score+=10;
    sessionStorage.setItem('gamehub_state',JSON.stringify(st));
  } catch(_){}
}

// ── Log ────────────────────────────────────────────────────────────────────────
function addLog(msg, hi=false) {
  logEntries.unshift({msg,hi});
  if (logEntries.length>40) logEntries.pop();
  document.getElementById('logWrap').innerHTML=
    logEntries.map(e=>`<div class="log-entry${e.hi?' highlight':''}">${esc(e.msg)}</div>`).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function goBack() { window.location.href='index.html'; }

newGame();