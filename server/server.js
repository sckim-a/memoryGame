const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/* 정적 파일 */
app.use(express.static(path.join(__dirname, "../client")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

/* ===== 게임 상태 ===== */
let rooms = {};

function createDeck() {
  const emojis = ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
                  "🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"];
  const deck = emojis.flatMap((e, i) => [
    { id: i + "-a", value: e },
    { id: i + "-b", value: e }
  ]);
  return deck.sort(() => Math.random() - 0.5);
}

io.on("connection", socket => {

  socket.on("createRoom", ({ roomId, nickname }) => {
    rooms[roomId] = {
      host: socket.id,
      started: false,
      deck: createDeck(),
    
      playerOrder: [socket.id],
      turnIndex: 0,
      turnCount: 1,
    
      flipped: [],
      failedCountInRound: 0, // 턴 계산용
    
      players: {
        [socket.id]: {
          nickname,
          score: 0,
          streak: 0
        }
      }
    };

    socket.join(roomId);
    io.to(roomId).emit("roomUpdate", rooms[roomId]);
  });

  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;
    room.players[socket.id] = { nickname, score: 0, streak: 0 };
    socket.join(roomId);
    io.to(roomId).emit("roomUpdate", room);
  });

  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room) return;
    room.started = true;
    io.to(roomId).emit("gameStarted", room.deck);
  });

  let flipped = [];

  socket.on("flipCard", ({ roomId, card }) => {
    const room = rooms[roomId];
    if (!room) return;
  
    const currentPlayerId = room.playerOrder[room.turnIndex];
  
    // ❌ 내 차례 아니면 무시
    if (socket.id !== currentPlayerId) return;
  
    // ❌ 같은 차례에 2장 초과 방지
    if (room.flipped.length >= 2) return;
  
    room.flipped.push(card);
  
    // ✅ 모두에게 카드 공개
    io.to(roomId).emit("cardFlipped", card);
  
    // 👉 아직 2장 안 됐으면 여기서 끝
    if (room.flipped.length < 2) return;
  
    /* =====================
       여기부터는 "무조건 실행"
       (성공 / 실패 공통 영역)
    ====================== */
  
    const [a, b] = room.flipped;
    const player = room.players[currentPlayerId];
    const isMatch = a.value === b.value;
  
    if (isMatch) {
      // ✅ 성공
      player.streak += 1;
      player.score += player.streak;
  
      io.to(roomId).emit("pairMatched", {
        cards: [a.id, b.id],
        playerId: currentPlayerId,
        score: player.score,
        streak: player.streak
      });
  
      room.deck = room.deck.filter(
        c => c.id !== a.id && c.id !== b.id
      );
  
    } else {
      // ❌ 실패
      player.streak = 0;
  
      io.to(roomId).emit("pairFailed", [a.id, b.id]);
  
      // 🔁 실패했을 때만 차례 이동
      room.turnIndex = (room.turnIndex + 1) % room.playerOrder.length;
      room.failedCountInRound++;
    }
  
    // 🔄 차례 종료 처리 (성공/실패 공통)
    room.flipped = [];
  
    // 🔢 턴 카운트 증가
    if (room.failedCountInRound >= room.playerOrder.length) {
      room.turnCount++;
      room.failedCountInRound = 0;
    }
  
    // 🔔 차례 업데이트는 무조건 보낸다
    io.to(roomId).emit("turnUpdate", {
      currentPlayer: room.playerOrder[room.turnIndex],
      turnCount: room.turnCount,
      players: room.players
    });
  
    // 🏁 게임 종료 체크
    if (room.deck.length === 0) {
      io.to(roomId).emit("gameEnded", room.players);
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      delete rooms[roomId].players[socket.id];
      io.to(roomId).emit("roomUpdate", rooms[roomId]);
    }
  });
});

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});


