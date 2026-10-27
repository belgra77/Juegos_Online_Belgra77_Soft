/* ============================================================
   Tres en Raya online by Belgra_77_Soft
   js/app.js — Lógica de juego, networking (PeerJS), Bo3,
   chat iMessage, emojis flotantes y orquestación de audio.
   ============================================================ */

import AudioEngine from "./audio.js";

"use strict";

/* ============================================================
   Helpers DOM / UI
   ============================================================ */
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

/* Emoji flotante sobre el tablero */
function spawnEmoji(emoji) {
  const area = $("#board-area");
  const rect = area.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = "emoji-float";
  el.textContent = emoji;
  el.style.left = `${rect.left + rect.width * (0.18 + Math.random() * 0.64)}px`;
  el.style.top = `${rect.top + rect.height * 0.6}px`;
  el.style.setProperty("--dx", `${(Math.random() - 0.5) * 90}px`);
  el.style.setProperty("--r", `${(Math.random() - 0.5) * 40}deg`);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

/* Burbuja de chat tipo iMessage sobre un avatar (desaparece en 4.5 s) */
function showBubble(whoIsMe, text) {
  const wrap = whoIsMe ? $("#player-me-wrap") : $("#player-op-wrap");
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

/* ============================================================
   Estado global
   ============================================================ */
const WINS_NEEDED = 2; // Bo3

const state = {
  mode: null,          // "quick" | "host" | "guest"
  mySymbol: "X",
  board: Array(9).fill(null),
  turn: "X",
  locked: false,
  score: { me: 0, op: 0 },
  round: 1,            // partida actual dentro de la serie
  oppConnected: false, // flag de conexión exacta de 2 jugadores
  diff: "normal",
  peer: null,
  conn: null,
  roomCode: null,
  gameOverSeries: false,
};

/* ============================================================
   Reconexión — detección de caídas, sincronización de estado
   y reintentos automáticos con cuenta atrás visible.
   ============================================================ */
const RECONN_WINDOW = 30; // segundos que ofrece la ventana de espera

let reconnCountdown = null;   // interval del contador
let reconnAttempts = 0;
let reconnMaxAttempts = 8;
let reconnecting = false;

function stopReconnectUI(silent = true) {
  clearInterval(reconnCountdown);
  reconnCountdown = null;
  reconnecting = false;
  $("#overlay-reconnect").classList.add("hidden");
  return silent;
}

function updateCountdown() {
  const left = Math.max(0, Math.ceil((state.reconnDeadline - Date.now()) / 1000));
  $("#reconnect-count").textContent = left;
  if (left <= 0) {
    clearInterval(reconnCountdown);
    closeNet();
    stopReconnectUI();
    toast("Sala cerrada por inactividad del rival ⏱️");
    showScreen("#screen-lobby");
  }
}

function handleDisconnect() {
  if (leaving || reconnecting || state.mode === "quick" || !state.mode) return;
  toast("Rival desconectado 😢 — esperando reconexión…");
  reconnecting = true;
  reconnAttempts = 0;
  state.reconnDeadline = Date.now() + RECONN_WINDOW * 1000;
  $("#reconnect-text").textContent = state.mode === "host"
    ? "Tu sala sigue abierta. El rival puede volver a entrar con el mismo código."
    : "Reconectando automáticamente a la sala…";
  $("#reconnect-count").textContent = RECONN_WINDOW;
  $("#overlay-reconnect").classList.remove("hidden");
  clearInterval(reconnCountdown);
  reconnCountdown = setInterval(updateCountdown, 500);

  if (state.mode === "guest") guestKeepReconnecting();
  // En modo host bastan Updated/estado limpio: el peer acepta nuevas conexiones.
  state.conn = null;
  state.oppConnected = false;
}

/* El invitado reintenta hasta 8 veces mientras siga la ventana de espera */
function guestKeepReconnecting() {
  if (!reconnecting || Date.now() > state.reconnDeadline) return;
  try { state.peer && state.peer.destroy(); } catch (_) {}
  state.peer = createPeer();
  state.peer.on("error", () => {}); // los fallos de sala reintentan en silencio
  state.peer.on("open", () => {
    if (!reconnecting) return;
    state.conn = state.peer.connect(PREFIX + state.roomCode, { reliable: true });
    state.conn.on("open", () => {
      reconnAttempts = 0;
      send({ t: "hello", name: "Tú", rejoin: true }); // pide sync completo
    });
    state.conn.on("data", onNetMessage);
    state.conn.on("close", handleDisconnect);
  });
  reconnAttempts++;
  if (reconnAttempts < reconnMaxAttempts) setTimeout(guestKeepReconnecting, 3000);
}

/* El anfitrión restaura el estado del invitado tras la caída */
function sendSync() {
  if (state.mode !== "host") return;
  send({
    t: "sync",
    board: state.board,
    score: state.score,
    round: state.round,
    turn: state.turn,
    champion: state.gameOverSeries,
  });
}

/* ============================================================
   Networking — PeerJS (WebRTC, sin backend propio)
   ============================================================ */
const PREFIX = "belgra77-trr-";

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function send(msg) {
  if (state.conn && state.conn.open) state.conn.send(msg);
}

let leaving = false; // salida intencionada: no debe disparar reconexión

function closeNet() {
  leaving = true;
  stopReconnectUI(false);
  try { state.conn && state.conn.close(); } catch (_) {}
  try { state.peer && state.peer.destroy(); } catch (_) {}
  state.peer = null; state.conn = null; state.oppConnected = false;
  setTimeout(() => { leaving = false; }, 0); // limpia el flag tras los callbacks de cierre
}

/** Esta es la ÚNICA puerta de entrada a la pantalla de juego.
    Exige exactamente 2 jugadores confirmados. */
function enterGameOnlyWhenTwoPlayers() {
  if (state.oppConnected !== true) return; // no 2/2 → jamás carga
  startSeries();
  showScreen("#screen-game");
  render();
  toast("🎮 ¡Rival conectado! Empieza la serie");
}

function onNetMessage(msg) {
  if (msg.t === "hello") {
    state.oppConnected = true;
    stopReconnectUI();
    if (state.mode === "host") {
      // Responde "welcome" y restaura la partida si era una reconexión
      send({ t: "welcome" });
      sendSync();
    }
    showScreen("#screen-game");
    render();
    toast(msg.rejoin ? "🔄 ¡Tu rival ha vuelto! Partida restaurada" : "🎮 ¡Rival conectado! Empieza la serie");
  } else if (msg.t === "welcome") {
    // Refuerzo de estado (el flujo completo llega en "sync")
    state.oppConnected = true;
  } else if (msg.t === "sync") {
    // Restauración tras reconexión: estado autoritativo del anfitrión
    stopReconnectUI();
    state.oppConnected = true;
    state.board = msg.board;
    state.score = msg.score;
    state.round = msg.round;
    state.turn = msg.turn;
    state.gameOverSeries = msg.champion;
    state.locked = false;
    buildBoard();
    // Redibuja las fichas del tablero sincronizado
    state.board.forEach((sym, i) => {
      if (!sym) return;
      const cell = $(`#board .cell[data-i="${i}"]`);
      cell.classList.add(sym.toLowerCase());
      cell.innerHTML = `<span class="mark">${sym === "X" ? "✕" : "⭕"}</span>`;
      cell.classList.add("disabled");
    });
    updateScores();
    if (state.gameOverSeries) showChampion();
    showScreen("#screen-game");
    render();
  } else if (msg.t === "move") {
    placeCell(msg.i, state.mySymbol === "X" ? "O" : "X");
  } else if (msg.t === "chat") {
    showBubble(false, msg.text);
    AudioEngine.msg();
  } else if (msg.t === "emoji") {
    spawnEmoji(msg.emoji);
    AudioEngine.emoji();
  } else if (msg.t === "nextRound") {
    resetBoardForRound(true);
  } else if (msg.t === "resetSeries") {
    state.score = { me: 0, op: 0 };
    state.round = 1; state.gameOverSeries = false;
    resetBoardForRound(true);
    render();
    toast("Marcador reiniciado 🔄");
  }
}

function setUpPeerHandlers() {
  state.peer.on("open", (id) => {
    if (state.mode === "host") {
      $("#wait-code").textContent = state.roomCode;
      $("#wait-status").textContent = "1 / 2 jugadores conectados";
    }
  });
  state.peer.on("error", (err) => {
    // En plena reconexión los fallos reintentan en silencio hasta agotar la ventana
    if (reconnecting) return;
    toast("⚠️ " + (err.type === "peer-unavailable" ? "Sala no encontrada" : "Error de conexión"));
    closeNet();
    showScreen("#screen-lobby");
  });

  if (state.mode === "host") {
    state.peer.on("connection", (conn) => {
      // Acepta al segundo jugador, o al mismo jugador reconectado
      if (state.conn && state.conn.open) { conn.close(); return; }
      state.conn = conn;
      conn.on("open", () => {
        state.oppConnected = true;
        stopReconnectUI();
        send({ t: "welcome" });
        sendSync(); // restaura la partida si el invitado se había caído
        enterGameOnlyWhenTwoPlayers();
      });
      conn.on("data", onNetMessage);
      conn.on("close", () => {
        if (state.conn === conn) handleDisconnect();
      });
    });
  }
}

function createPeer(pid) {
  const options = {
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
        { urls: "stun:stun.cloudflare.com:3478" },
      ],
      iceCandidatePoolSize: 8,
    },
  };
  return pid ? new Peer(pid, options) : new Peer(options);
}

/* ---- Crear sala (anfitrión) ---- */
function createRoom() {
  closeNet();
  state.mode = "host";
  state.roomCode = randomCode();
  state.oppConnected = false;
  $("#wait-code").textContent = state.roomCode;
  $("#wait-status").textContent = "Conectando a la red de salas…";
  $("#wait-hint").textContent = "Toca el código para copiar 📋";
  showScreen("#screen-waiting");
  $("#spinner").classList.remove("hidden");

  state.peer = createPeer(PREFIX + state.roomCode);
  setUpPeerHandlers();
}

/* ---- Unirse a sala (invitado) ---- */
function joinRoom() {
  const code = String($("#input-code").value || "").trim();
  if (!/^\d{6}$/.test(code)) { toast("Introduce un código de 6 dígitos 🔢"); return; }
  closeNet();
  state.mode = "guest";
  state.roomCode = code;
  state.oppConnected = false;
  showScreen("#screen-waiting");
  $("#spinner").classList.add("hidden");
  $("#wait-code").textContent = code;
  $("#wait-status").textContent = "Conectando con el anfitrión…";
  $("#wait-hint").textContent = "En cuanto el anfitrión acepte, entras ⏳";

  state.peer = createPeer();
  setUpPeerHandlers();
  state.peer.on("open", () => {
    state.conn = state.peer.connect(PREFIX + code, { reliable: true });
    state.conn.on("open", () => {
      send({ t: "hello", name: "Tú" });
      // La pantalla de juego la abre el mensaje "welcome"/hello del anfitrión
    });
    state.conn.on("data", onNetMessage);
    state.conn.on("close", handleDisconnect);
  });
  state.oppConnected = false; // hasta que llegue hello-paquete de anfitrión
  // Nota: el anfitrión responde con "hello-like" bienvenido que activa la puerta 2/2.
  // Para robustez, si en el host flujo el guest espera, el gesto "welcome" ya lo activa.
}

/* ============================================================
   IA local — Partida Rápida
   ============================================================ */
const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function winnerOf(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { sym: board[a], line: [a, b, c] };
  }
  return board.every(Boolean) ? { sym: "draw", line: [] } : null;
}

function findWinning(board, sym) {
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = sym;
    const w = winnerOf(board);
    board[i] = null;
    if (w && w.sym === sym) return i;
  }
  return null;
}

/* Minimax ligero (para nivel difícil) */
function minimax(board, me, turn) {
  const w = winnerOf(board);
  if (w) return { score: w.sym === "draw" ? 0 : w.sym === me ? 10 : -10 };
  const moves = [];
  board.forEach((c, i) => { if (!c) moves.push(i); });
  const scores = moves.map((i) => {
    board[i] = turn;
    const r = minimax(board, me, turn === "X" ? "O" : "X");
    board[i] = null;
    return r.score;
  });
  const best = turn === me ? Math.max(...scores) : Math.min(...scores);
  return { score: best };
}

function aiPick() {
  const b = [...state.board];
  const ai = state.mySymbol === "X" ? "O" : "X";
  const free = b.map((c, i) => (c ? null : i)).filter((v) => v !== null);

  if (state.diff === "easy") {
    // 60 % aleatorio, 40 % gana si puede
    return Math.random() < 0.6 ? free[Math.floor(Math.random() * free.length)] :
      findWinning(b, ai) ?? free[Math.floor(Math.random() * free.length)];
  }
  if (state.diff === "normal") {
    // Heurística: ganar → bloquear → centro → esquina → aleatorio
    return findWinning(b, ai) ?? findWinning(b, state.mySymbol) ??
      (b[4] ? free.includes(4) ? 4 : null : 4) ??
      pickCorner(b) ?? free[Math.floor(Math.random() * free.length)];
  }
  // Difícil: minimax con apertura algo variada
  if (free.length === 9) return [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)];
  let bestScore = -Infinity, bestMove = free[0];
  for (const i of free) {
    b[i] = ai;
    const { score } = minimax(b, ai, state.mySymbol);
    b[i] = null;
    if (score > bestScore) { bestScore = score; bestMove = i; }
  }
  return bestMove;
}

function pickCorner(b) {
  for (const c of [0, 2, 6, 8]) if (!b[c]) return c;
  return null;
}

/* ============================================================
   Flujo de partida — Serie al mejor de 3 (Bo3)
   ============================================================ */

function startSeries() {
  state.score = { me: 0, op: 0 };
  state.round = 1;
  state.gameOverSeries = false;
  $("#score-me").textContent = "0";
  $("#score-op").textContent = "0";
  resetBoardForRound(true);
}

function resetBoardForRound(alternate) {
  if (alternate) state.turn = state.round % 2 === 1 ? "X" : "O"; // alterna salida
  else state.turn = state.mySymbol;
  state.board = Array(9).fill(null);
  state.locked = false;
  buildBoard();
  scheduleAiTurn(); // Si le toca mover primero a la IA (rondas pares), actúa sola
}

/* En Partida Rápida, cuando el turno inicial es de la IA, la IA abre. */
function scheduleAiTurn() {
  if (state.mode !== "quick" || state.turn === state.mySymbol || state.gameOverSeries) return;
  state.locked = true;
  setTimeout(() => {
    if (state.gameOverSeries) return;
    const mv = aiPick();
    if (mv != null) placeCell(mv, state.mySymbol === "X" ? "O" : "X");
    state.locked = false;
    render();
  }, 600 + Math.random() * 400);
}

function buildBoard() {
  const boardEl = $("#board");
  boardEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const c = document.createElement("div");
    c.className = "cell glass-soft";
    c.dataset.i = i;
    c.addEventListener("pointerdown", () => onCellTap(i, c));
    boardEl.appendChild(c);
  }
}

function myTurnActive() {
  return !state.locked && state.turn === state.mySymbol &&
    state.oppConnected !== false;
}

function onCellTap(i, cellEl) {
  if (state.board[i] || state.locked) return;
  // En partida rápida la IA es el único "rival"
  if (state.mode === "quick" && state.turn !== state.mySymbol) return;
  if (state.mode !== "quick" && state.turn !== state.mySymbol) return toast("Espera tu turno ⏳");

  const sym = state.mySymbol;
  placeCell(i, sym);
  if (state.mode !== "quick") send({ t: "move", i });

  if (state.mode === "quick" && !isGameOver()) {
    state.locked = true; // la IA "piensa"
    setTimeout(() => {
      if (state.gameOverSeries) return;
      const mv = aiPick();
      if (mv != null) placeCell(mv, state.mySymbol === "X" ? "O" : "X");
      state.locked = false;
      render();
    }, 500 + Math.random() * 400);
  }
}

function placeCell(i, sym) {
  if (state.board[i]) return;
  state.board[i] = sym;
  const cell = $(`#board .cell[data-i="${i}"]`);
  cell.classList.add(sym.toLowerCase());
  cell.innerHTML = `<span class="mark">${sym === "X" ? "✕" : "⭕"}</span>`;
  cell.classList.add("disabled");
  sym === "X" ? AudioEngine.tapX() : AudioEngine.tapO();

  const w = winnerOf(state.board);
  if (w) finishRound(w);
  else {
    state.turn = state.turn === "X" ? "O" : "X";
    render();
  }
}

function finishRound(win) {
  state.locked = true;
  if (win.sym === "draw") {
    AudioEngine.draw();
    toast("🤝 Empate en esta partida");
    advanceRound(true);
    return;
  }
  const winningCells = win.line.map(idx => $(`#board .cell[data-i="${idx}"]`));
  // Resaltar celdas ganadoras secuencialmente
  winningCells.forEach((cell, idx) => {
    if (cell) setTimeout(() => cell.classList.add("win"), idx * 80);
  });
  // Efecto confetti simple con emojis
  for (let i = 0; i < 6; i++) {
    setTimeout(() => spawnEmoji(["🎉", "🎊", "🏆"][Math.floor(Math.random() * 3)]), i * 120);
  }
  const iMe = win.sym === state.mySymbol;
  if (iMe) state.score.me++; else state.score.op++;
  AudioEngine.fanfare();
  updateScores();
  render();
  const champ = WINS_NEEDED === 2 && (state.score.me >= WINS_NEEDED || state.score.op >= WINS_NEEDED);
  if (champ) {
    state.gameOverSeries = true;
    setTimeout(showChampion, 1400);
  } else {
    state.round++;
    updateRoundUI();
    setTimeout(() => {
      resetBoardForRound(true);
      if (state.mode !== "quick") send({ t: "nextRound" });
      render();
      toast(`Partida ${state.round} de la serie 🎯`);
    }, 1600);
  }
}

function updateScores() {
  $("#score-me").textContent = state.score.me;
  $("#score-op").textContent = state.score.op;
}

function updateRoundUI() {
  $("#round-label").textContent = `Partida ${state.round} · Mejor de 3`;
  document.querySelectorAll("[data-round-dot]").forEach((d, idx) => {
    d.className = "w-8 h-2 rounded-full " + (idx < state.round ? "bg-sky-400" : "bg-slate-700");
  });
}

function render() {
  updateRoundUI();
  const myTurn = state.turn === state.mySymbol && !state.locked && !state.gameOverSeries;
  $("#turn-label").textContent = state.gameOverSeries ? "Serie finalizada" :
    myTurn ? "🎯 Tu turno" : "⏳ Turno del rival";
  $("#player-me-wrap").classList.toggle("active-player-glow", myTurn);
  $("#player-op-wrap").classList.toggle("active-player-glow", !myTurn);
}

function isGameOver() { return winnerOf(state.board) !== null; }

/* ============================================================
   Gran Final — Modal de campeón
   ============================================================ */
function showChampion() {
  const win = state.score.me >= WINS_NEEDED;
  $("#champion-text").textContent = win
    ? `🏆 ¡Eres el campeón! (${state.score.me} – ${state.score.op})`
    : `🤖 Gana el rival (${state.score.op} – ${state.score.me})`;
  $("#modal-champion").classList.remove("hidden");
  AudioEngine.fanfare();
}

function resetSeries() {
  $("#modal-champion").classList.add("hidden");
  state.score = { me: 0, op: 0 };
  state.round = 1;
  state.gameOverSeries = false;
  resetBoardForRound(true);
  if (state.mode !== "quick") send({ t: "resetSeries" });
  updateScores();
  render();
  toast("Nueva serie al mejor de 3 🔥");
}

/* ============================================================
   Eventos UI
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {

  /* Botones de dificultad */
  document.querySelectorAll(".diff-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach((x) => x.classList.replace("bg-sky-500/30", ""));
      b.classList.add("bg-sky-500/30");
      state.diff = b.dataset.diff;
      toast(`Dificultad: ${b.textContent.trim()}`);
    });
  });
  state.diff = "normal";

  $("#btn-quick").addEventListener("click", () => {
    state.mode = "quick";
    state.mySymbol = "X"; // El jugador sale con ✕; la IA es ⭕
    state.oppConnected = true; // Partida rápida: 2 actores garantizados (jugador + IA)
    enterGameOnlyWhenTwoPlayers();
  });

  $("#btn-create").addEventListener("click", createRoom);
  $("#btn-join").addEventListener("click", joinRoom);

  /* Copiar código de sala */
  $("#btn-copy-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      $("#wait-hint").textContent = "¡Código copiado! 📋";
      AudioEngine.msg();
    } catch (_) {
      toast(state.roomCode);
    }
  });

  $("#btn-leave").addEventListener("click", () => { closeNet(); showScreen("#screen-lobby"); });

  /* Botones del modal */
  $("#btn-reset-score").addEventListener("click", resetSeries);
  $("#btn-lobby").addEventListener("click", () => {
    $("#modal-champion").classList.add("hidden");
    closeNet();
    showScreen("#screen-lobby");
  });

  /* Barra de emojis */
  const bar = $("#emoji-bar");
  document.querySelectorAll("#emoji-bar .emoji-btn").forEach((b) => {
    b.textContent = b.dataset.emoji;
    b.addEventListener("click", () => {
      spawnEmoji(b.dataset.emoji);
      AudioEngine.emoji();
      send({ t: "emoji", emoji: b.dataset.emoji });
      bar.classList.add("hidden");
    });
  });
  $("#btn-emoji").addEventListener("click", () => bar.classList.toggle("hidden"));

  /* Chat rápido */
  const QUIPS = ["¡Buena jugada! 👏", "¡Vamos! 🔥", "Jajaja 😂", "¡Qué nervios!", "¡Vaya! 😱", "Buena suerte 🍀"];
  $("#btn-chat").addEventListener("click", () => {
    const q = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    showBubble(true, q);
    AudioEngine.msg();
    if (state.mode !== "quick") send({ t: "chat", text: q });
  });

  $("#chat-send").addEventListener("click", () => {
    const inp = $("#chat-input");
    const txt = inp.value.trim().slice(0, 40);
    if (!txt) return;
    showBubble(true, txt);
    AudioEngine.msg();
    if (state.mode === "quick") {
      // La IA responde desde el "otro lado" del chat en Partida Rápida
      setTimeout(() => {
        showBubble(false, QUIPS[Math.floor(Math.random() * QUIPS.length)]);
        AudioEngine.msg();
      }, 900 + Math.random() * 900);
    } else {
      send({ t: "chat", text: txt });
    }
    inp.value = "";
  });
  $("#chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#chat-send").click(); });

  /* Toggles de audio en la navbar */
  const syncMusic = (on) => { $("#btn-music").textContent = on ? "🎵" : "🔇"; $("#btn-music").style.opacity = on ? 1 : 0.5; };
  const syncSfx = (on) => { $("#btn-sfx").textContent = on ? "🔊" : "🔕"; $("#btn-sfx").style.opacity = on ? 1 : 0.5; };
  syncMusic(AudioEngine.musicOn);
  syncSfx(AudioEngine.sfxOn);
  $("#btn-music").addEventListener("click", () => syncMusic(AudioEngine.toggleMusic()));
  $("#btn-sfx").addEventListener("click", () => syncSfx(AudioEngine.toggleSfx()));

  /* Overlay de reconexión */
  $("#btn-wait-reconn").addEventListener("click", () => {
    // Amplía la ventana de gracia 30 s más y reanuda los reintentos
    state.reconnDeadline = Date.now() + RECONN_WINDOW * 1000;
    clearInterval(reconnCountdown);
    reconnCountdown = setInterval(updateCountdown, 500);
    $("#reconnect-count").textContent = RECONN_WINDOW;
    if (state.mode === "guest") guestKeepReconnecting();
    toast("Ventana ampliada 30 s ⏳");
  });
  $("#btn-exit-reconn").addEventListener("click", () => {
    closeNet();
    showScreen("#screen-lobby");
  });

  showScreen("#screen-lobby");
});

/* Hook de depuración/QA: permite forzar estados en pruebas manuales.
   Uso: __TRR.state.score.me = 1  ·  __TRR.forceChampion() */
window.__TRR = {
  state,
  forceChampion() {
    state.score.me = Math.max(state.score.me, WINS_NEEDED);
    state.gameOverSeries = true;
    showChampion();
  }
};
