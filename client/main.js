const socket = io("http://localhost:3000");

const grid = document.getElementById("grid");
const turnInfo = document.getElementById("turnInfo");
const resultBox = document.getElementById("result");

let myNickname = "kim";
let myRoomId = null;
let mySocketId = null;
let cards = {};

/* 방 생성 (테스트용) */
socket.emit("createRoom", {
  roomName: "테스트방",
  nickname: myNickname,
  maxPlayers: 5
});

/* 서버에서 내 소켓 ID 받기 */
socket.on("connect", () => {
  mySocketId = socket.id;
});

/* 게임 시작 */
socket.on("gameStarted", room => {
  myRoomId = room.roomId;
  grid.innerHTML = "";
  resultBox.innerHTML = "";
  cards = {};

  turnInfo.textContent = "게임 시작!";

  room.deck.forEach(card => {
    const el = document.createElement("div");
    el.className = "card";
    el.textContent = "❓";
    el.onclick = () => {
      socket.emit("flipCard", {
        roomId: room.roomId,
        cardId: card.id
      });
    };
    el.id = card.id;
    grid.appendChild(el);
    cards[card.id] = el;
  });
});

/* 카드 뒤집힘 */
socket.on("cardFlipped", card => {
  const el = cards[card.id];
  if (!el) return;
  el.classList.add("flipped");
  el.textContent = card.pairId; // 나중에 🐶 같은 이모지로 교체
});

/* 성공 */
socket.on("pairMatched", ({ cards: ids }) => {
  ids.forEach(id => {
    const el = cards[id];
    if (el) el.classList.add("removed");
  });
});

/* 실패 */
socket.on("pairMismatched", ids => {
  ids.forEach(id => {
    const el = cards[id];
    if (!el) return;
    el.classList.add("shake");
    setTimeout(() => {
      el.classList.remove("flipped", "shake");
      el.textContent = "❓";
    }, 350);
  });
});

/* 게임 종료 */
socket.on("gameEnded", ranking => {
  resultBox.innerHTML =
    ranking.map((p, i) =>
      `${i + 1}위 ${p.nickname} (${p.score}점)`
    ).join("<br>");

  if (ranking[0].nickname === myNickname) {
    resultBox.innerHTML +=
      `<div class="firework">🎆 1위 축하합니다! 🎉</div>`;
  }
});
