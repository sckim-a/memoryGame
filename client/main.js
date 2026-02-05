const socket = io();

let currentRoom = null;
let cards = {};
let myId = null;
let currentTurnPlayer = null;

const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const board = document.getElementById("board");
const roomList = document.getElementById("roomList");

socket.on("connect", () => {
  myId = socket.id;
});

socket.on("roomList", rooms => {
  roomList.innerHTML = "";
  Object.values(rooms).forEach(r => {
    if (r.started) return;
    const li = document.createElement("li");
    li.textContent = r.name;
    li.onclick = () => joinRoom(r.id);
    roomList.appendChild(li);
  });
});

function createRoom() {
  const nickname = document.getElementById("nickname").value;
  const cardStyle = document.getElementById("cardStyle").value;
  localStorage.setItem("nickname", nickname);
  socket.emit("createRoom", { nickname, cardStyle });
}

function joinRoom(roomId) {
  const nickname = localStorage.getItem("nickname");
  socket.emit("joinRoom", { roomId, nickname });
  currentRoom = roomId;
}

socket.on("roomUpdate", room => {
  currentRoom = room.id;

  /* === 화면 전환 === */
  lobbyDiv.style.display = "none";
  roomDiv.style.display = "block";
  gameDiv.style.display = "none";

  /* === 방 정보 렌더링 === */
  renderPlayers(room.players);
  renderRoomInfo(room);

  /* === 방장만 시작 버튼 === */
  if (room.host === myId) {
    startBtn.style.display = "block";
  } else {
    startBtn.style.display = "none";
  }
});

function startGame() {
  socket.emit("startGame", currentRoom);
}

socket.on("gameStarted", data => {
  lobby.classList.add("hidden");
  game.classList.remove("hidden");

  board.innerHTML = "";
  cards = {};
  currentTurnPlayer = data.currentPlayer;

  data.deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.onclick = () => {
      socket.emit("flipCard", { roomId: currentRoom, card });
    };
    div.textContent = card.value;
    cards[card.id] = div;
    board.appendChild(div);
  });

  updateTurnUI();
});

socket.on("cardFlipped", card => {
  cards[card.id].textContent = card.value;
});

socket.on("pairMatched", data => {
  data.cards.forEach(id => {
    cards[id].classList.add("matched");
  });
});

socket.on("pairFailed", ids => {
  ids.forEach(id => {
    cards[id].textContent = "";
  });
});

socket.on("turnUpdate", data => {
  currentTurnPlayer = data.currentPlayer;
  updateTurnUI();
});

socket.on("gameEnded", players => {
  document.getElementById("result").classList.remove("hidden");
});

function updateTurnUI() {
  if (currentTurnPlayer === myId) {
    game.classList.add("my-turn");
  } else {
    game.classList.remove("my-turn");
  }
}

function restartGame() {
  socket.emit("restartGame", currentRoom);
  document.getElementById("result").classList.add("hidden");
}

function exitGame() {
  location.reload();
}
