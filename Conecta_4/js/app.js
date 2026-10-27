// Conecta 4 online by Belgra_77_Soft
// js/app.js — Lógica: lobby, salas 6-dígitos, puerta 2/2, IA, chat, emojis

const WINS_NEEDED = 2; // Serie al mejor de 3
const RED = "red";
const YELLOW = "yellow";

const state = {
  mode: null, // "quick" | "host" | "guest"
  playerColor: RED,
  aiColor: YELLOW,
  grid: Array(42).fill(null),
  counts: Array(7).fill(0),
  turn: RED,
  locked: false,
  score: { me: 0, op: 0 },
  round: 1,
  oppConnected: false,
  diff: "normal",
  peer: null,
  conn: null,
  roomCode: null,
  gameOverSeries: false,
};

const $ = (sel) => document.querySelector(sel);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

let toastTimer = null;
function toast(text, ms = 2200) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

function spawnEmoji(emoji) {
  const area = document.getElementById("board-area");
  if (!area) return;
  const rect = area.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = "emoji-float";
  el.textContent = emoji;
  el.style.left = rect.left + rect.width * (0.18 + Math.random() * 0.64) + "px";
  el.style.top = rect.top + rect.height * 0.6 + "px";
  el.style.setProperty("--dx", (Math.random() - 0.5) * 90 + "deg");
  el.style.setProperty("--r", (Math.random() - 0.5) * 40 + "deg");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

function showBubble(whoIsMe, text) {
  const wrap = whoIsMe ? document.getElementById("player-me-wrap") : document.getElementById("player-op-wrap");
  if (!wrap) return;
  const old = wrap.querySelector(".chat-bubble");
  if (old) old.remove();
  const b = document.createElement("div");
  b.className = "chat-bubble" + (whoIsMe ? "" : " opponent");
  b.textContent = text;
  wrap.appendChild(b);
  setTimeout(() => b.classList.add("leaving"), 4200);
  setTimeout(() => b.remove(), 4550);
}

const $ = (sel) => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// Inicializar tablero
function buildBoard() {
  const board = document.getElementById("board4");
  board.innerHTML = "";
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = document.createElement("div");
      cell.className = "cell4";
      cell.dataset.col = c;
      if (state.grid[r * 7 + c]) {
        cell.classList.add("occupied-" + state.grid[r * 7 + c]);
        cell.innerHTML = `<div class="disc4 ${state.grid[r * 7 + c]}"></div>`;
      }
      board.appendChild(cell);
    }
  }
  board.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest("[data-col]");
    if (!cell) return;
    onColumnTap(Number(cell.dataset.col));
  });
}

// --- Networking — PeerJS ---
const PREFIX = "belgra77-c4-";

function createRoom() {
  // ... (lógica de crear sala)
}

function joinRoom() {
  const code = document.getElementById("input-code").value.trim();
  if (!/^\d{6}$/.test(code)) { toast("Introduce un código de 6 dígitos"); return; }
  // ... (lógica de unirse)
}

// IA simple
function aiMove() {
  const candidates = [];
  for (let c = 0; c < 7; c++) if (state.counts[c] < 5) candidates.push(c);
  // Fácil: 70% aleatorio, 30% bloqueo o victoria
  if (state.diff === "easy" && Math.random() < 0.3) {
    const winning = candidates.find(c => {
      const t = state.counts.slice(); t[c]++; return checkWin(state.aiColor) && checkWin(state.aiColor).color === state.aiColor;
    });
    if (winning) return winning;
    const block = candidates.find(c => {
      const t = state.counts.slice(); t[c]++; const w = checkWin("red"); return w && w.color === "red";
    });
    if (block) return block;
  }
  if (state.diff === "normal") {
    const winning = candidates.find(c => { const t = state.counts.slice(); t[c]++; return checkWin(state.aiColor) && checkWin(state.aiColor).color === state.aiColor; });
    if (winning) return winning;
    const block = candidates.find(c => { const t = state.counts.slice(); t[c]++; const w = checkWin("red"); return w && w.color === "red"; });
    if (block) return block;
    if (candidates.includes(3)) return 3;
    const corners = [0, 2, 4, 6].filter(c => candidates.includes(c));
    if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
  }
  if (state.diff === "hard") {
    // Minimax simplificado
    return minimaxAI(state.aiColor, "red", candidates, 3);
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function minimaxAI(aiColor, humanColor, candidates, depth) {
  const evaluate = (b) => {
    const w = checkWin(aiColor);
    if (w && w.color === aiColor) return 10 - depth;
    const h = checkWin(humanColor);
    if (h && h.color === humanColor) return depth - 10;
    return 0;
  }
  if (depth <= 0 || candidates.length === 0) return candidates[0];
  let bestScore = -Infinity, bestMove = candidates[0];
  for (const c of candidates) {
    const t = state.counts.slice(); t[c]++;
    const score = evaluate(t);
    if (score !== 0) { state.counts = t; return c; }
    const humanCandidates = [];
    for (let k = 0; k < 7; k++) if (state.counts[k] < 5 && k !== c) humanCandidates.push(k);
    let worstScore = Infinity;
    for (const hc of humanCandidates) {
      const th = state.counts.slice(); th[hc]++; const hscore = evaluate(th); worstScore = Math.min(worstScore, hscore);
    }
    if (worstScore > bestScore) { bestScore = worstScore; bestMove = c; }
  }
  return bestMove;
}

function placeDisc(col, color) {
  if (state.counts[col] >= 5) return { win: false };
  const row = state.counts[col];
  state.grid[row * 7 + col] = color;
  state.counts[col]++;
  if (color === "red") state.aiColor === "red" ? state.aiColor : state.aiColor; // placeholder
  renderBoard();
  const w = checkWin(color);
  if (w) { highlightWin(w.line); }
  return { win: !!w };
}

function checkWin(color) {
  // Filas, columnas, diagonales
  // ... (lógica completa de victoria)
  return null;
}

function highlightWin(line) {
  line.forEach(([r, c]) => {
    const cell = document.querySelector(`#board4 .cell4[data-row="${r}"][data-col="${c}"]`);
    if (cell) cell.classList.add("win");
  });
}

function initBoard() {
  state.grid = Array(42).fill(null);
  state.counts = Array(7).fill(0);
  state.locked = false;
  buildBoard();
}

function initEvents() {
  // Event listeners para columnas
}

initBoard();
initEvents();
