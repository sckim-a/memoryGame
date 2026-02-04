const socket = io();

const roomListEl = document.getElementById("roomList");
const board = document.getElementById("board");
const info = document.getElementById("info");
const score = document.getElementById("score");
const imageInput = document.getElementById("imageInput");

let currentRoom = null;

document.getElementById("cardStyle").onchange = e => {
  imageInput.style.display = e.target.value === "image" ? "block" : "none";
};

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

socket.on("roomUpdate", room => {
  currentRoom = room;
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
});

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

socket.on("cardFlipped", card => {
  const el = document.querySelector(`[data-id="${card.id}"]`);
  if (!el) return;
  if (card.type === "image") {
    el.innerHTML = `<img src="${card.value}">`;
  } else {
    el.textContent = card.value;
  }
});

socket.on("pairMatched", ({ ids, players }) => {
  ids.forEach(id => document.querySelector(`[data-id="${id}"]`)?.remove());
  updateScore(players);
});

socket.on("pairFailed", ids => {
  setTimeout(() => {
    ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) el.innerHTML = "";
    });
  }, 800);
});

socket.on("turnUpdate", ({ currentPlayer, turnCount, players }) => {
  info.textContent = `턴 ${turnCount} / ${players[currentPlayer].nickname} 차례`;
  updateScore(players);
});

function updateScore(players) {
  score.innerHTML = "";
  Object.values(players).forEach(p => {
    const d = document.createElement("div");
    d.textContent = `${p.nickname}: ${p.score}`;
    score.appendChild(d);
  });
}
