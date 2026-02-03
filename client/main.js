const socket = io("https://memorygame-hg6s.onrender.com");

/* =====================
   상태
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
   입력
===================== */
const nicknameInput = () => $("nickname")?.value.trim();
const roomIdInput = () => $("roomId")?.value.trim();

/* =====================
   방 생성 / 참가
===================== */
window.createRoom = () => {
   console.log("createRoom clicked");
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

  $("lobby")?.style && ($("lobby").style.display = "none");
  $("game")?.style && ($("game").style.display = "block");

  updateScore();
});

socket.on("gameStarted", ({ deck, currentPlayer }) => {
  currentPlayerId = currentPlayer;
  isMyTurn = myId === currentPlayer;
  turnCount = 1;

  renderBoard(deck);
  updateTurnText();
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
   카드 공개
===================== */
socket.on("cardFlipped", card => {
  const el = document.querySelector(`[data-id="${card.id}"]`);
  if (!el) return;

  el.classList.add("flipped");
  el.textContent = card.value;
  flippedLocal.push(card);
});

/* =====================
   성공
===================== */
socket.on("pairMatched", ({ cards }) => {
  setTimeout(() => {
    cards.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.add("matched");
    });
    flippedLocal = [];
  }, 600);
});

/* =====================
   실패
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
   턴 업데이트
===================== */
socket.on("turnUpdate", ({ currentPlayer, turnCount: tc, players: p }) => {
  currentPlayerId = currentPlayer;
  players = p;
  turnCount = tc;

  isMyTurn = myId === currentPlayerId;

  updateTurnText();
  updateScore();

  document.querySelectorAll(".card").forEach(card => {
    card.style.pointerEvents = isMyTurn ? "auto" : "none";
  });
});

/* =====================
   종료
===================== */
socket.on("gameEnded", playersData => {
  players = playersData;
  updateScore(true);
});

/* =====================
   UI
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

function updateTurnText() {
  // turnInfo가 없으므로 console/log 또는 score에 같이 표시
  const name = players[currentPlayerId]?.nickname || "";
  document.title = `턴 ${turnCount} · ${name}`;
}

function updateScore(final = false) {
  const el = $("score");
  if (!el) return;

  const sorted = Object.values(players)
    .sort((a, b) => b.score - a.score);

  el.innerHTML = sorted
    .map((p, i) => {
      const crown = final && i === 0 ? " 👑" : "";
      return `${i + 1}. ${p.nickname}: ${p.score}${crown}`;
    })
    .join("<br>");
}
