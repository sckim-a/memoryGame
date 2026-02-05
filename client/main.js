const socket = io();

const lobbyDiv = document.getElementById("lobby");
const roomDiv = document.getElementById("room");
const gameDiv = document.getElementById("game");
const roomList = document.getElementById("roomList");

const nicknameInput = document.getElementById("nicknameInput");
const cardStyleSelect = document.getElementById("cardStyle");
const imageUpload = document.getElementById("imageUpload");

const createRoomBtn = document.getElementById("createRoomBtn");
const startBtn = document.getElementById("startBtn");

const endModal = document.getElementById("endModal");
const rankList = document.getElementById("rankList");
const restartBtn = document.getElementById("restartBtn");
const leaveBtn = document.getElementById("leaveBtn");

let myId = null;
let currentRoom = null;
let cards = {};
let cardStyle = "emoji";
let gameRunning = false;

// 🔥 초기 화면 강제 세팅
lobbyDiv.classList.remove("hidden");
roomDiv.classList.add("hidden");
gameDiv.classList.add("hidden");
endModal.classList.add("hidden");

/* =====================
   기본
===================== */
socket.on("connect", () => {
  myId = socket.id;
});

/* =====================
   방 생성
===================== */
createRoomBtn.onclick = () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) return alert("닉네임 입력");

  cardStyle = cardStyleSelect.value;

  socket.emit("createRoom", {
    nickname,
    cardStyle
  });
};

/* =====================
   방 목록
===================== */
socket.on("roomList", rooms => {
  roomList.innerHTML = "";
  Object.values(rooms).forEach(room => {
    const li = document.createElement("li");
    li.textContent = room.name;
    li.onclick = () => {
      socket.emit("joinRoom", {
        roomId: room.id,
        nickname: nicknameInput.value
      });
    };
    roomList.appendChild(li);
  });
});

/* =====================
   방 업데이트
===================== */
socket.on("roomUpdate", room => {
  currentRoom = room.id;
  lobbyDiv.classList.add("hidden");
  roomDiv.classList.remove("hidden");

  document.getElementById("roomTitle").textContent = room.name;

  if (room.host === myId) {
    startBtn.classList.remove("hidden");
  }
});

/* =====================
   게임 시작
===================== */
startBtn.onclick = () => {
  socket.emit("startGame", currentRoom);
};

socket.on("gameStarted", data => {
  const { deck, currentPlayer } = data;

   gameRunning = true;
   endModal.classList.add("hidden");
  roomDiv.classList.add("hidden");
  gameDiv.classList.remove("hidden");
  gameDiv.innerHTML = "";
  cards = {};

  deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.onclick = () => {
      socket.emit("flipCard", {
        roomId: currentRoom,
        card
      });
    };

    div.textContent = card.value;
    cards[card.id] = div;
    gameDiv.appendChild(div);
  });

  updateTurnUI(currentPlayer);
});

/* =====================
   턴 UI
===================== */
function updateTurnUI(currentPlayer) {
  Object.values(cards).forEach(c => c.classList.remove("my-turn"));
  if (currentPlayer === myId) {
    Object.values(cards).forEach(c => c.classList.add("my-turn"));
  }
}

socket.on("turnUpdate", data => {
  updateTurnUI(data.currentPlayer);
});

/* =====================
   카드 처리
===================== */
socket.on("cardFlipped", card => {
  cards[card.id].textContent = card.value;
});

socket.on("pairMatched", data => {
  data.cards.forEach(id => {
    setTimeout(() => cards[id].remove(), 500);
  });
});

socket.on("pairFailed", ids => {
  setTimeout(() => {
    ids.forEach(id => cards[id].textContent = "");
  }, 800);
});

/* =====================
   게임 종료
===================== */
socket.on("gameEnded", players => {
   console.log("gameEnded received");
   if (!gameRunning) return; // 🔥 여기서 1차 차단
  gameRunning = false;
   if (!currentRoom) return; // 🔥 방 없으면 무시
   
  endModal.classList.remove("hidden");
  rankList.innerHTML = "";

  Object.values(players)
    .sort((a,b)=>b.score-a.score)
    .forEach(p => {
      const li = document.createElement("li");
      li.textContent = `${p.nickname} : ${p.score}`;
      rankList.appendChild(li);
    });
});

/* =====================
   종료 버튼
===================== */
restartBtn.onclick = () => {
   if (!currentRoom) return;
  endModal.classList.add("hidden");
   gameRunning = true;
  gameDiv.innerHTML = "";
  socket.emit("startGame", currentRoom);
};

leaveBtn.onclick = () => {
  socket.disconnect();
  location.reload();
};
