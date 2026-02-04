const socket = io();

let myId = null;
let currentRoomId = null;
let deck = [];

socket.on("connect", () => {
  myId = socket.id;
});

function createRoom() {
  const nickname = document.getElementById("nickname").value.trim();
  const cardStyle = document.getElementById("cardStyle").value;
  if (!nickname) return alert("닉네임 필수");

  socket.emit("createRoom", { nickname, cardStyle });
}

function joinRoom(roomId) {
  const nickname = document.getElementById("nickname").value.trim();
  if (!nickname) return alert("닉네임 필수");

  socket.emit("joinRoom", { roomId, nickname });
}

function startGame() {
  socket.emit("startGame", currentRoomId);
}

socket.on("roomList", rooms => {
  const ul = document.getElementById("roomList");
  ul.innerHTML = "";
  rooms.forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.name} (${r.players}명)`;
    if (!r.started) {
      const b = document.createElement("button");
      b.textContent = "입장";
      b.onclick = () => joinRoom(r.roomId);
      li.appendChild(b);
    }
    ul.appendChild(li);
  });
});

socket.on("roomJoined", roomId => {
  currentRoomId = roomId;
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
});

socket.on("gameStarted", data => {
  deck = data.deck;
  renderBoard();
  updateInfo(data);
  updateScore(data.players);
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
  }, 700);
});

socket.on("turnUpdate", data => {
  updateInfo(data);
  updateScore(data.players);
});

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  deck.forEach(card => {
    const d = document.createElement("div");
    d.id = card.id;
    d.className = "card";
    d.onclick = () => {
      socket.emit("flipCard", { roomId: currentRoomId, card });
    };
    board.appendChild(d);
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
