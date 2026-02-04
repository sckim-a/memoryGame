const socket = io();
let roomId = "";
let myId = "";
let currentPlayer = "";
let players = {};
let removed = [];
let style = {};

const $ = id => document.getElementById(id);

window.onload = () => {
  $("nickname").value = localStorage.getItem("nickname") || "";
};

window.createRoom = async () => {
  const nick = $("nickname").value.trim();
  if (!nick) return alert("닉네임 필수");

  localStorage.setItem("nickname", nick);

  const type = document.querySelector('input[name="cardStyle"]:checked').value;
  const fd = new FormData();
  fd.append("nickname", nick);
  fd.append("cardStyleType", type);

  if (type === "image") {
    const f = $("imageFile").files[0];
    if (!f) return alert("이미지 선택");
    fd.append("image", f);
  }

  const res = await fetch("/create-room", { method: "POST", body: fd });
  const { roomId: rid } = await res.json();

  socket.emit("registerHost", { roomId: rid, nickname: nick });
};

window.joinRoom = roomId =>
  socket.emit("joinRoom", { roomId, nickname: $("nickname").value });

socket.on("roomJoined", r => {
  roomId = r.roomId;
  players = r.players;
  myId = socket.id;
  $("lobby").style.display = "none";
  $("game").style.display = "block";
  $("startBtn").style.display = myId === r.host ? "block" : "none";
});

window.startGame = () => socket.emit("startGame", roomId);

socket.on("gameStarted", data => {
  style = data.cardStyle;
  currentPlayer = data.currentPlayer;
  removed = [];
  renderBoard(data.deck);
});

function renderBoard(deck) {
  $("board").innerHTML = "";
  deck.forEach(card => {
    const d = document.createElement("div");
    d.className = "card";
    d.dataset.id = card.id;
    d.onclick = () => socket.emit("flipCard", { roomId, card });
    $("board").appendChild(d);
  });
}

socket.on("cardFlipped", card => {
  const el = document.querySelector(`[data-id="${card.id}"]`);
  if (!el) return;
  el.classList.add("flipped");

  if (style.type === "image")
    el.innerHTML = `<img src="${card.value}">`;
  else
    el.textContent = card.value;
});

socket.on("pairMatched", data => {
  data.cards.forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) el.style.visibility = "hidden";
  });
  players = data.players;
  updateScore();
});

socket.on("pairFailed", ids => {
  setTimeout(() => {
    ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.textContent = "";
        el.classList.remove("flipped");
      }
    });
  }, 700);
});

socket.on("turnUpdate", data => {
  currentPlayer = data.currentPlayer;
  players = data.players;
  updateScore();
});

function updateScore() {
  $("score").innerHTML = Object.values(players)
    .map(p => `${p.nickname}: ${p.score}`)
    .join("<br>");
}
