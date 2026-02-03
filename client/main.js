/* ======================
   socket 초기화
====================== */
const socket = io();

let roomId = "";
let deck = [];
let mySocketId = "";
let locked = false;

/* ======================
   입력값 헬퍼
====================== */
function roomIdInput() {
  return document.getElementById("roomId").value.trim();
}

function nicknameInput() {
  return document.getElementById("nickname").value.trim();
}

/* ======================
   방 생성 / 참여
====================== */
function createRoom() {
  roomId = roomIdInput();
  socket.emit("createRoom", {
    roomId,
    nickname: nicknameInput()
  });
}

function joinRoom() {
  roomId = roomIdInput();
  socket.emit("joinRoom", {
    roomId,
    nickname: nicknameInput()
  });
}

/* ======================
   소켓 연결
====================== */
socket.on("connect", () => {
  mySocketId = socket.id;
  console.log("MY SOCKET ID:", mySocketId);
});

/* ======================
   로비 업데이트
====================== */
socket.on("roomUpdate", room => {
  const lobby = document.getElementById("lobby");

  lobby.innerHTML = `
    <h3>방 ID: ${roomId}</h3>
    <ul>
      ${Object.values(room.players)
        .map(p => `<li>${p.nickname}</li>`)
        .join("")}
    </ul>
    ${room.host === mySocketId
      ? `<button onclick="startGame()">게임 시작</button>`
      : `<p>방장이 게임을 시작할 때까지 대기중...</p>`}
  `;
});

/* ======================
   게임 시작
====================== */
function startGame() {
  socket.emit("startGame", roomId);
}

socket.on("gameStarted", cards => {
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");

  deck = cards;
  renderBoard();
});

/* ======================
   보드 렌더링
====================== */
function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  deck.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.id = card.id;

    div.addEventListener("click", () => {
      socket.emit("flipCard", { roomId, card });
    });

    board.appendChild(div);
  });
}

/* ======================
   카드 공개 (전원 동기화)
====================== */
socket.on("cardFlipped", card => {
  const el = document.querySelector(`[data-id="${card.id}"]`);
  if (!el) return;

  el.classList.add("open");
  el.textContent = card.value;
});

/* ======================
   카드 매칭 성공
====================== */
socket.on("pairMatched", ({ cards }) => {
  setTimeout(() => {
    cards.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) el.remove();
    });
  }, 300);
});

/* ======================
   카드 매칭 실패
====================== */
socket.on("pairFailed", ids => {
  locked = true;

  setTimeout(() => {
    ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (!el) return;

      el.classList.remove("open");
      el.textContent = "";
    });
    locked = false;
  }, 800);
});

/* ======================
   턴 / 점수 / 차례 표시
====================== */
socket.on("turnUpdate", ({ currentPlayer, turnCount, players }) => {
  const status = document.getElementById("status");

  status.innerHTML = `
    <h3>턴 ${turnCount}</h3>
    <ul>
      ${Object.entries(players)
        .map(([id, p]) => `
          <li style="font-weight:${id === currentPlayer ? "bold" : "normal"}">
            ${p.nickname}
            - ${p.score}점
            ${p.streak > 1 ? `🔥${p.streak}` : ""}
            ${id === currentPlayer ? " ⬅️ 내 차례" : ""}
          </li>
        `)
        .join("")}
    </ul>
  `;
});

/* ======================
   게임 종료
====================== */
socket.on("gameEnded", players => {
  const sorted = Object.values(players)
    .sort((a, b) => b.score - a.score);

  alert(
    "게임 종료!\n\n" +
    sorted
      .map((p, i) => `${i + 1}위 ${p.nickname} - ${p.score}점`)
      .join("\n")
  );
});
