const socket = io();
let roomId = "";
let deck = [];
let locked = false;

function roomIdInput() {
  return document.getElementById("roomId").value.trim();
}

function nicknameInput() {
  return document.getElementById("nickname").value.trim();
}

function createRoom() {
  roomId = roomIdInput();
  socket.emit("createRoom", {
    roomId,
    nickname: nicknameInput()
  });
}

socket.on("roomUpdate", room => {
  console.log("ROOM UPDATE:", room);

  // 로비 상태 표시
  document.getElementById("lobby").innerHTML = `
    <h3>방 ID: ${roomId}</h3>
    <ul>
      ${Object.values(room.players)
        .map(p => `<li>${p.nickname} (${p.score}점)</li>`)
        .join("")}
    </ul>
    ${room.host === socket.id
      ? `<button onclick="startGame()">게임 시작</button>`
      : `<p>방장이 게임을 시작할 때까지 대기중...</p>`}
  `;
});

function joinRoom() {
  roomId = roomIdInput();
  socket.emit("joinRoom", {
    roomId,
    nickname: nicknameInput()
  });
}

function startGame() {
  socket.emit("startGame", roomId);
}

socket.on("gameStarted", cards => {
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  deck = cards;
  render();
});

function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.onclick = () => flip(card, div);
    div.dataset.id = card.id;
    board.appendChild(div);
  });
}

function flip(card, el) {
  if (locked || el.classList.contains("open")) return;
  el.classList.add("open");
  el.textContent = card.value;
  socket.emit("flipCard", { roomId, card });
}

socket.on("pairMatched", ({ cards }) => {
  cards.forEach(id => {
    document.querySelector(`[data-id="${id}"]`)?.remove();
  });
});

socket.on("pairFailed", ids => {
  locked = true;
  setTimeout(() => {
    ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.classList.remove("open");
        el.textContent = "";
      }
    });
    locked = false;
  }, 800);
});

socket.on("gameEnded", players => {
  alert("게임 종료!");
});
