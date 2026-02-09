const socket = io();

/* ---------- DOM ---------- */
const lobby = document.getElementById("lobby");
const roomDiv = document.getElementById("room");
const resultDiv = document.getElementById("result");
const restartBtn = document.getElementById("restartBtn");
const leaveBtn = document.getElementById("leaveBtn");

const roomList = document.getElementById("roomList");
const nicknameInput = document.getElementById("nickname");
const cardStyleSelect = document.getElementById("cardStyle");
const imageUpload = document.getElementById("imageUpload");

const createBtn = document.getElementById("createBtn");
const startBtn = document.getElementById("startBtn");

const board = document.getElementById("board");
const playersDiv = document.getElementById("players");
const scoreDiv = document.getElementById("score");
const turnInfo = document.getElementById("turnInfo");
const roomTitle = document.getElementById("roomTitle");

const rankingList = document.getElementById("ranking");
const fireworksCanvas = document.getElementById("fireworks");
const NICKNAME_KEY = "memorygame_nickname";

/* ---------- 상태 ---------- */
let myId;
let currentRoom;
let currentCardStyle = "emoji";
let cards = {};
let canFlip = false;

// 저장된 닉네임 자동 복원
const savedNickname = localStorage.getItem(NICKNAME_KEY);
if (savedNickname) {
  nicknameInput.value = savedNickname;
}

/* ---------- 소켓 연결 ---------- */
socket.on("connect", () => {
  myId = socket.id;
});

/* ---------- 카드 스타일 UI ---------- */
cardStyleSelect.onchange = () => {
  imageUpload.classList.toggle(
    "hidden",
    cardStyleSelect.value !== "image"
  );
};

/* ---------- 방 만들기 ---------- */
createBtn.onclick = async () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) return alert("닉네임은 필수입니다");

  localStorage.setItem(NICKNAME_KEY, nickname);
  
  currentCardStyle = cardStyleSelect.value;
  let imagePaths = [];

  if (currentCardStyle === "image") {
    if (imageUpload.files.length < 24) {
      return alert("이미지는 최소 24장 필요합니다");
    }

    const formData = new FormData();
    for (let i = 0; i < 24; i++) {
      formData.append("images", imageUpload.files[i]);
    }

    const res = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    imagePaths = await res.json();
  }

  socket.emit("createRoom", {
    nickname,
    cardStyle: currentCardStyle,
    images: imagePaths
  });
};

/* ---------- 방 목록 ---------- */
socket.on("roomList", rooms => {
  roomList.innerHTML = "";

  Object.values(rooms).forEach(room => {
    if (room.started) return;

    const li = document.createElement("li");
    li.textContent = `${room.name} (${Object.keys(room.players).length}명)`;

    li.onclick = () => {
      const nickname = nicknameInput.value.trim();
      if (!nickname) return alert("닉네임 필수");

      localStorage.setItem(NICKNAME_KEY, nickname);
      currentRoom = room.id;
      currentCardStyle = room.cardStyle;

      socket.emit("joinRoom", {
        roomId: room.id,
        nickname
      });

      lobby.classList.add("hidden");
      roomDiv.classList.remove("hidden");
      roomTitle.textContent = room.name;
    };

    roomList.appendChild(li);
  });
});

/* ---------- 방 업데이트 ---------- */
socket.on("roomUpdate", room => {
  if (room.id !== currentRoom) return;

  playersDiv.innerHTML = "";
  Object.values(room.players).forEach(p => {
    const d = document.createElement("div");
    d.textContent = p.nickname;
    playersDiv.appendChild(d);
  });

  if (room.host === myId && !room.started) {
    startBtn.classList.remove("hidden");
    startBtn.onclick = () => socket.emit("startGame", room.id);
  }
});

/* ---------- 게임 시작 ---------- */
socket.on("gameStarted", data => {
  board.innerHTML = "";
  cards = {};
  canFlip = true;

  data.deck.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";

    const front = document.createElement("div");
    front.className = "front";
    front.textContent = "?";

    const back = document.createElement("div");
    back.className = "back";

    if (currentCardStyle === "image") {
      const img = document.createElement("img");
      img.src = card.value;
      back.appendChild(img);
    } else {
      back.textContent = card.value; // 숫자 / 이모지
    }

    cardEl.appendChild(front);
    cardEl.appendChild(back);

    cardEl.onclick = () => {
      if (!canFlip || cardEl.classList.contains("open")) return;
      socket.emit("flipCard", { roomId: currentRoom, card });
    };

    board.appendChild(cardEl);
    cards[card.id] = cardEl;
  });

  updateTurn(data.currentPlayer, data.turnCount, data.players);
});

/* ---------- 카드 뒤집기 ---------- */
socket.on("cardFlipped", card => {
  const el = cards[card.id];
  if (!el) return;
  el.classList.add("open");
});

/* ---------- 실패 ---------- */
socket.on("pairFailed", ids => {
  canFlip = false;
  setTimeout(() => {
    ids.forEach(id => {
      const el = cards[id];
      if (el) el.classList.remove("open");
    });
    canFlip = true;
  }, 800);
});

/* ---------- 성공 ---------- */
socket.on("pairMatched", data => {
  // 이미 cardFlipped에서 두 장은 열린 상태
  canFlip = false;

  // 잠깐 보여주기
  setTimeout(() => {
    data.cards.forEach(id => {
      const el = cards[id];
      if (!el) return;

      el.classList.add("matched");

      // 완전히 제거 (클릭/표시 안 됨)
      el.style.visibility = "hidden";
      el.style.pointerEvents = "none";
    });

    canFlip = true;
  }, 600); // ← 여기 시간 조절 가능 (ms)
});

/* ---------- 턴 / 점수 ---------- */
socket.on("turnUpdate", data => {
  updateTurn(data.currentPlayer, data.turnCount, data.players);
});

function updateTurn(currentPlayer, turnCount, players) {
  turnInfo.textContent =
    `턴 ${turnCount} / 현재 차례: ${players[currentPlayer].nickname}`;

  scoreDiv.innerHTML = "";
  playersDiv.innerHTML = "";

  Object.values(players).forEach(p => {
    const d = document.createElement("div");
    d.textContent = `${p.nickname} (${p.score}점)`;

    if (p.socketId === currentPlayer) {
      d.classList.add("active-turn");

      if (p.socketId === myId) {
        d.classList.add("me");
      }
    }

    playersDiv.appendChild(d);
    scoreDiv.appendChild(d.cloneNode(true));
  });
}

/* ---------- 종료 ---------- */
socket.on("gameEnded", players => {
  roomDiv.classList.add("hidden");
  resultDiv.classList.remove("hidden");

  const ranked = Object.values(players)
    .sort((a, b) => b.score - a.score);

  rankingList.innerHTML = "";
  ranked.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}위 ${p.nickname} (${p.score}점)`;
    rankingList.appendChild(li);
  });

  if (ranked[0].socketId === myId) {
    startFireworks();
  }

  // 1️⃣ 1인 플레이만 서버 랭킹 저장
  if (ranked.length === 1) {
    socket.emit("singlePlayGameEnd", {
      nickname: ranked[0].nickname,
      turns: turnCount,                       // 기존 변수 그대로
      playTime: Date.now() - gameStartTime,   // 기존 시작시간 사용
      mode: gameMode,                         // number | emoji | image
      playerCount: 1
    });
  }
  
});

/* ---------- 다시하기 ---------- */
restartBtn.onclick = () => {
  resultDiv.classList.add("hidden");
  roomDiv.classList.remove("hidden");

  socket.emit("restartGame", currentRoom);
};

/* ---------- 나가기 ---------- */
leaveBtn.onclick = () => {
  socket.emit("leaveRoom", currentRoom);

  currentRoom = null;
  board.innerHTML = "";
  cards = {};

  resultDiv.classList.add("hidden");
  roomDiv.classList.add("hidden");
  lobby.classList.remove("hidden");
};

/* ---------- 폭죽 ---------- */
function startFireworks() {
  const c = fireworksCanvas;
  const ctx = c.getContext("2d");

  c.width = window.innerWidth;
  c.height = window.innerHeight;

  const parts = [];
  for (let i = 0; i < 150; i++) {
    parts.push({
      x: c.width / 2,
      y: c.height / 2,
      vx: Math.random() * 6 - 3,
      vy: Math.random() * 6 - 3,
      life: 100,
      color: `hsl(${Math.random() * 360},100%,50%)`
    });
  }

  function draw() {
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    if (parts.some(p => p.life > 0)) requestAnimationFrame(draw);
  }

  draw();
}
