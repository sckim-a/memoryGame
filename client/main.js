const socket = io();

const lobby = document.getElementById("lobby");
const roomDiv = document.getElementById("room");
const resultDiv = document.getElementById("result");

const nicknameInput = document.getElementById("nickname");
const roomList = document.getElementById("roomList");
const gameDiv = document.getElementById("game");
const scoreDiv = document.getElementById("score");
const turnInfo = document.getElementById("turnInfo");
const roomTitle = document.getElementById("roomTitle");
const startBtn = document.getElementById("startBtn");

const rankingList = document.getElementById("ranking");
const fireworksCanvas = document.getElementById("fireworks");

let myId = null;
let currentRoom = null;
let cards = {};
let cardStyle = "emoji";

/* 닉네임 저장 */
nicknameInput.value = localStorage.getItem("nickname") || "";
nicknameInput.onchange = () =>
  localStorage.setItem("nickname", nicknameInput.value);

/* 방 생성 */
function createRoom() {
  if (!nicknameInput.value) return alert("닉네임 필수");

  cardStyle = document.getElementById("cardStyle").value;

  socket.emit("createRoom", {
    nickname: nicknameInput.value,
    cardStyle
  });
}

/* 방 참가 */
function joinRoom(id) {
  socket.emit("joinRoom", {
    roomId: id,
    nickname: nicknameInput.value
  });
}

/* 게임 시작 */
function startGame() {
  socket.emit("startGame", currentRoom);
}

/* 다시하기 */
function restartGame() {
  socket.emit("restartGame", currentRoom);
  resultDiv.classList.add("hidden");
  roomDiv.classList.remove("hidden");
}

/* 나가기 */
function leaveRoom() {
  location.reload();
}

/* 소켓 */
socket.on("connect", () => {
  myId = socket.id;
});

socket.on("roomList", rooms => {
  roomList.innerHTML = "";
  Object.keys(rooms).forEach((id, i) => {
    const li = document.createElement("li");
    li.textContent = `메모리게임${i + 1}`;
    li.onclick = () => joinRoom(id);
    roomList.appendChild(li);
  });
});

socket.on("roomUpdate", room => {
  currentRoom = room.id;
  lobby.classList.add("hidden");
  roomDiv.classList.remove("hidden");
  roomTitle.textContent = room.name;
});

socket.on("gameStarted", data => {
  gameDiv.innerHTML = "";
  cards = {};

  const deck = data.deck;                 // ⭐ 핵심
  currentTurnPlayer = data.currentPlayer; // 턴 UI용
  turnCount = data.turnCount;

  deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";

    div.onclick = () => socket.emit("flipCard", {
      roomId: currentRoom,
      card
    });

    if (cardStyle === "image") {
      const img = document.createElement("img");
      img.src = card.value;
      div.appendChild(img);
    } else {
      div.textContent = card.value;
    }

    cards[card.id] = div;
    gameDiv.appendChild(div);
  });

  updateTurnUI(); // 👉 이미 있다면 그대로 사용
});

socket.on("cardFlipped", card => {
  cards[card.id].classList.add("open");
});

socket.on("pairMatched", ({ cards: ids }) => {
  setTimeout(() => {
    ids.forEach(id => cards[id].remove());
  }, 800);
});

socket.on("pairFailed", ids => {
  setTimeout(() => {
    ids.forEach(id => cards[id].classList.remove("open"));
  }, 800);
});

socket.on("turnUpdate", data => {
  turnInfo.textContent = `턴 ${data.turnCount}`;
  scoreDiv.innerHTML = "";

  Object.entries(data.players).forEach(([id, p]) => {
    const d = document.createElement("div");
    d.textContent = `${p.nickname}: ${p.score}`;
    scoreDiv.appendChild(d);
  });

  if (data.currentPlayer === myId)
    gameDiv.classList.add("my-turn");
  else
    gameDiv.classList.remove("my-turn");
});

socket.on("gameEnded", players => {
  roomDiv.classList.add("hidden");
  resultDiv.classList.remove("hidden");

  const ranked = Object.values(players)
    .sort((a, b) => b.score - a.score);

  rankingList.innerHTML = "";
  ranked.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}위 ${p.nickname} (${p.score})`;
    rankingList.appendChild(li);
  });

  if (ranked[0].id === myId) startFireworks();
});

/* 폭죽 */
function startFireworks() {
  const c = fireworksCanvas;
  const ctx = c.getContext("2d");
  c.width = innerWidth;
  c.height = innerHeight;

  const ps = Array.from({ length: 120 }, () => ({
    x: c.width / 2,
    y: c.height / 2,
    vx: Math.random() * 6 - 3,
    vy: Math.random() * 6 - 3,
    life: 100,
    color: `hsl(${Math.random() * 360},100%,50%)`
  }));

  (function anim() {
    ctx.clearRect(0, 0, c.width, c.height);
    ps.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    });
    if (ps.some(p => p.life > 0)) requestAnimationFrame(anim);
  })();
}
