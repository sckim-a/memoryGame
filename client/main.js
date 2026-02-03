const socket = io();

/* =====================
   상태 변수
===================== */
let roomId = "";
let myId = "";
let players = {};
let currentPlayerId = "";
let turnCount = 1;
let flippedLocal = [];
let isMyTurn = false;

/* =====================
   DOM 유틸
===================== */
const $ = id => document.getElementById(id);

/* =====================
   입력값
===================== */
const nicknameInput = () => $("nickname")?.value.trim();
const roomIdInput = () => $("roomId")?.value.trim();

/* =====================
   방 생성 / 참가
===================== */
window.createRoom = () => {
  if (!nicknameInput()) return alert("닉네임 입력");
  socket.emit("createRoom", { nickname: nicknameInput() });
};

window.joinRoom = () => {
  if (!nicknameInput() || !roomIdInput()) return alert("입력 확인");
  socket.emit("joinRoom", {
    roomId: roomIdInput(),
    nickname: nicknameInput()
  });
};

/* =====================
   서버 이벤트
===================== */
socket.on("roomJoined", data => {
  roomId = data.roomId;
  myId = socket.id;
  players = data.players;

  $("lobby").style.display = "none";
  $("game").style.display = "block";

  updateScoreboard();
});

socket.on("gameStarted", ({ deck, currentPlayer }) => {
  currentPlayerId = currentPlayer;
  isMyTurn = myId === currentPlayer;
  turnCount = 1;
  renderBoard(deck);
  updateTurnUI();
});

/* =====================
   카드 클릭
===================== */
function onCardClick(card, el) {
  if (!isMyTurn) return;
  if (flippedLocal.length >= 2) return;
  if (el.classList.contains("flipped")) return;

  socket.emit("flipCard", { roomId, card });
}

/* =====================
   카드 뒤집힘 (모두에게)
===================== */
socket.on("cardFlipped", card => {
  const el = document.querySelector(`[data-id="${card.id}"]`);
  if (!el) return;

  el.classList.add("flipped");
  el.textContent = card.value;
  flippedLocal.push(card);
});

/* =====================
   카드 매칭 성공
===================== */
socket.on("pairMatched", ({ cards, playerId }) => {
  setTimeout(() => {
    cards.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.add("matched");
    });
    flippedLocal = [];
  }, 600);
});

/* =====================
   카드 매칭 실패
===================== */
socket.on("pairFailed", cards => {
  setTimeout(() => {
    cards.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (!el) return;
      el.classList.remove("flipped");
      el.textContent = "";
    });
    flippedLocal = [];
  }, 800);
});

/* =====================
   턴 업데이트 (🔥 핵심)
===================== */
socket.on("turnUpdate", data => {
  currentPlayerId = data.currentPlayer;
  players = data.players;
  turnCount = data.turnCount;

  isMyTurn = myId === currentPlayerId;
  updateTurnUI();
  updateScoreboard();

  // 🔒 내 차례 아닐 때 클릭 차단
  document.querySelectorAll(".card").forEach(card => {
    card.style.pointerEvents = isMyTurn ? "auto" : "none";
  });
});

/* =====================
   게임 종료
===================== */
socket.on("gameEnded", playersData => {
  players = playersData;
  updateScoreboard(true);
  showFireworks();
});

/* =====================
   UI 렌더링
===================== */
function renderBoard(deck) {
  const board = $("board");
  if (!board) return;

  board.innerHTML = "";
  deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.id = card.id;
    div.onclick = () => onCardClick(card, div);
    board.appendChild(div);
  });
}

function updateTurnUI() {
  const el = $("turnInfo");
  if (!el) return;

  const name = players[currentPlayerId]?.nickname || "";
  el.textContent = `턴 ${turnCount} · ${name} 차례`;
}

function updateScoreboard(final = false) {
  const el = $("scoreboard");
  if (!el) return;

  const sorted = Object.values(players)
    .sort((a, b) => b.score - a.score);

  el.innerHTML = sorted
    .map((p, i) => {
      const medal = final && i === 0 ? " 🏆" : "";
      return `${i + 1}. ${p.nickname} : ${p.score}${medal}`;
    })
    .join("<br>");
}

/* =====================
   폭죽 🎆
===================== */
function showFireworks() {
  const fw = $("fireworks");
  if (!fw) return;

  fw.classList.add("active");
  setTimeout(() => fw.classList.remove("active"), 4000);
}
