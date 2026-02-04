const socket = io();

let currentRoomId = null;
let myId = null;
let deck = [];

socket.on("connect", () => {
  myId = socket.id;
});

function createRoom() {
  const nickname = document.getElementById("nickname").value.trim();
  if (!nickname) return alert("닉네임 필수");

  socket.emit("createRoom", { nickname });
}

function joinRoom(roomId) {
  const nickname = document.getElementById("nickname").value.trim();
  if (!nickname) return alert("닉네임 필수");

  socket.emit("joinRoom", { roomId, nickname });
}

function startGame() {
  socket.emit("startGame", currentRoomId);
}

socket.on("roomJoined", roomId => {
  currentRoomId = roomId;
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
});

socket.on("roomList", rooms => {
  const ul = document.getElementById("roomList");
  ul.innerHTML = "";

  rooms.forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.name} (${r.players}명)`;
    if (!r.started) {
      const btn = document.createElement("button");
      btn.textContent = "입장";
      btn.onclick = () => joinRoom(r.roomId);
      li.appendChild(btn);
    }
    ul.appendChild(li);
  });
});

socket.on("gameStarted", data => {
  deck = data.deck;
  renderBoard();
  updateInfo(data);
});

socket.on("cardFlipped", card => {
  const el = document.getElementById(card.id);
  if (el) el.textContent = card.value;
});

socket.on("pairMatched", ({ ids, players }) => {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  updateScore(players);
});

socket.on("pairFailed", ids => {
  setTimeout(() => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "";
    });
  }, 800);
});

socket.on("turnUpdate", data => {
  updateInfo(data);
  updateScore(data.players);
});

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  deck.forEach(card => {
    const div = document.createElement("div");
    div.id = card.id;
    div.className = "card";
    div.onclick = () => {
      socket.emit("flipCard", { roomId: currentRoomId, card });
    };
    board.appendChild(div);
  });
}

function updateInfo(data) {
  document.getElementById("info").textContent =
    `턴 ${data.turnCount} / 현재 차례: ${data.currentPlayer}`;
}

function updateScore(players) {
  const s = document.getElementById("score");
  s.innerHTML = "";
  Object.values(players).forEach(p => {
    s.innerHTML += `${p.nickname}: ${p.score}점<br>`;
  });
}
