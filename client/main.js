const socket = io();

const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const result = document.getElementById("result");

const roomListEl = document.getElementById("roomList");
const board = document.getElementById("board");
const info = document.getElementById("info");
const score = document.getElementById("score");
const ranking = document.getElementById("ranking");
const imageInput = document.getElementById("imageInput");

let currentRoom = null;

/* ===== 카드 스타일 선택 ===== */
document.getElementById("cardStyle").onchange = e => {
  imageInput.style.display = e.target.value === "image" ? "block" : "none";
};

/* ===== 방 생성 ===== */
async function createRoom() {
  const nickname = document.getElementById("nickname").value.trim();
  const style = document.getElementById("cardStyle").value;
  if (!nickname) return alert("닉네임 필수");

  let images = [];
  if (style === "image") {
    const form = new FormData();
    [...imageInput.files].forEach(f => form.append("images", f));
    const res = await fetch("/upload", { method: "POST", body: form });
    images = await res.json();
  }

  localStorage.setItem("nickname", nickname);
  socket.emit("createRoom", { nickname, cardStyle: style, images });
}

/* ===== 방 목록 ===== */
socket.on("roomList", rooms => {
  roomListEl.innerHTML = "";
  Object.values(rooms).forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.name} (${Object.keys(r.players).length})`;
    li.onclick = () => socket.emit("joinRoom", {
      roomId: r.id,
      nickname: localStorage.getItem("nickname")
    });
    roomListEl.appendChild(li);
  });
});

/* ===== 방 입장 ===== */
socket.on("roomUpdate", room => {
  currentRoom = room;
  lobby.classList.add("hidden");
  game.classList.remove("hidden");
});

/* ===== 게임 시작 ===== */
socket.on("gameStarted", deck => {
  board.innerHTML = "";
  deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.id = card.id;
    div.dataset.type = card.type;
    div.onclick = () => socket.emit("flipCard", { roomId: currentRoom.id, card });
    board.appendChild(div);
  });
});

/* ===== 카드 뒤집기 ===== */
socket.on("cardFlipped", card => {
  const el = document.querySelector(`[data-id="${card.id}"]`);
  if (!el) return;

  if (card.type === "image") {
    el.innerHTML = `<img src="${card.value}">`;
  } else {
    el.textContent = card.value;
  }
});

/* ===== 성공 ===== */
socket.on("pairMatched", ({ ids, players }) => {
  ids.forEach(id => document.querySelector(`[data-id="${id}"]`)?.remove());
  updateScore(players);
});

/* ===== 실패 ===== */
socket.on("pairFailed", ids => {
  setTimeout(() => {
    ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) el.innerHTML = "";
    });
  }, 800);
});

/* ===== 턴 업데이트 ===== */
socket.on("turnUpdate", ({ currentPlayer, turnCount, players }) => {
  info.textContent = `턴 ${turnCount} / ${players[currentPlayer].nickname} 차례`;
  updateScore(players);
});

/* ===== 게임 종료 ===== */
socket.on("gameEnded", players => {
  game.classList.add("hidden");
  result.classList.remove("hidden");

  const sorted = Object.values(players)
    .sort((a, b) => b.score - a.score);

  ranking.innerHTML = "";
  sorted.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}위 - ${p.nickname} (${p.score}점)`;
    ranking.appendChild(li);
  });

  launchFireworks();
});

/* ===== 점수판 ===== */
function updateScore(players) {
  score.innerHTML = "";
  Object.values(players).forEach(p => {
    const d = document.createElement("div");
    d.textContent = `${p.nickname}: ${p.score}`;
    score.appendChild(d);
  });
}

/* ===== 폭죽 ===== */
function launchFireworks() {
  const canvas = document.getElementById("fireworks");
  const ctx = canvas.getContext("2d");

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  let particles = [];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 60
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.fillRect(p.x, p.y, 4, 4);
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    });
    particles = particles.filter(p => p.life > 0);
    if (particles.length) requestAnimationFrame(draw);
  }

  draw();
}
