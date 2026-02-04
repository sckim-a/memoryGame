const socket = io();

let roomId = "";
let myId = "";
let players = {};
let hostId = "";
let currentPlayerId = "";
let isMyTurn = false;
let flippedLocal = [];

const $ = id => document.getElementById(id);

/* ===== 로비 ===== */
window.createRoom = () => {
  socket.emit("createRoom", { nickname: $("nickname").value });
};

window.joinRoom = roomId => {
  socket.emit("joinRoom", {
    roomId,
    nickname: $("nickname").value
  });
};

socket.on("roomListUpdate", rooms => {
  $("roomList").innerHTML = rooms.map(r =>
    `<div>
      ${r.roomId} (${r.players})
      ${r.started ? "진행중" : `<button onclick="joinRoom('${r.roomId}')">참가</button>`}
    </div>`
  ).join("");
});

/* ===== 방 입장 ===== */
socket.on("roomJoined", data => {
  roomId = data.roomId;
  players = data.players;
  hostId = data.host;
  myId = socket.id;

  $("lobby").style.display = "none";
  $("game").style.display = "block";

  $("startBtn").style.display =
    myId === hostId ? "block" : "none";

  updateScore();
});

/* ===== 게임 시작 ===== */
window.startGame = () => {
  socket.emit("startGame", roomId);
};

socket.on("gameStarted", ({ deck, currentPlayer }) => {
  currentPlayerId = currentPlayer;
  isMyTurn = myId === currentPlayer;
  $("startBtn").style.display = "none";
  renderBoard(deck);
});

/* ===== 게임 로직 ===== */
function onCardClick(card) {
  if (!isMyTurn || flippedLocal.length >= 2) return;
  socket.emit("flipCard", { roomId, card });
}

socket.on("cardFlipped", card => {
  const el = document.querySelector(`[data-id="${card.id}"]`);
  el.textContent = card.value;
  el.classList.add("flipped");
  flippedLocal.push(card);
});

socket.on("pairMatched", ({ cards }) => {
  setTimeout(() => {
    cards.forEach(id =>
      document.querySelector(`[data-id="${id}"]`)?.classList.add("matched")
    );
    flippedLocal = [];
  }, 500);
});

socket.on("pairFailed", cards => {
  setTimeout(() => {
    cards.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.textContent = "";
        el.classList.remove("flipped");
      }
    });
    flippedLocal = [];
  }, 700);
});

socket.on("turnUpdate", data => {
  players = data.players;
  currentPlayerId = data.currentPlayer;
  isMyTurn = myId === currentPlayerId;
  updateScore();

  document.querySelectorAll(".card").forEach(c=>{
    c.style.pointerEvents = isMyTurn ? "auto" : "none";
  });
});

socket.on("gameEnded", playersData => {
  players = playersData;
  updateScore();
  alert("게임 종료!");
});

/* ===== 렌더 ===== */
function renderBoard(deck) {
  const board = $("board");
  board.innerHTML = "";
  deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.id = card.id;
    div.onclick = () => onCardClick(card);
    board.appendChild(div);
  });
}

function updateScore() {
  $("score").innerHTML = Object.values(players)
    .sort((a,b)=>b.score-a.score)
    .map(p=>`${p.nickname}: ${p.score}`)
    .join("<br>");
}
