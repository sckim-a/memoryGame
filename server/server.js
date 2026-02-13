const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { admin, db } = require("./firebase");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const RECONNECT_LIMIT = 60 * 1000; // 1분

/* ===============================
   정적 파일
================================ */
app.use(express.static(path.join(__dirname, "../client")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

/* ===============================
   게임 상태
================================ */
const rooms = {};

/* ===============================
   카드 덱 생성 (24쌍 = 48장)
================================ */
function createDeck(cardStyle, images = []) {
  let values = [];

  if (cardStyle === "emoji") {
    values = [
      "🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁",
      "🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤",
      "🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"
    ];
  }

  if (cardStyle === "number") {
    values = Array.from({ length: 1 }, (_, i) => i + 1);
  }

  if (cardStyle === "image") {
    values = images; // 업로드된 이미지 경로 24개
  }

  const deck = values.flatMap((v, i) => ([
    { id: `${i}-a`, value: v },
    { id: `${i}-b`, value: v }
  ]));

  return deck.sort(() => Math.random() - 0.5);
}


/* ===============================
   Socket 연결
================================ */
io.on("connection", socket => {
  console.log("connected:", socket.id);

  /* ---------- 방 생성 ---------- */
  socket.on("createRoom", ({ nickname, cardStyle, images }) => {
    if (!nickname) return;

    const roomId = `room-${Date.now()}`;

    rooms[roomId] = {
      id: roomId,
      name: `메모리게임${Object.keys(rooms).length + 1}`,
      host: socket.id,
      started: false,

      cardStyle, // number | emoji | image
      deck: createDeck(cardStyle, images),

      order: [socket.id],
      turnIndex: 0,
      turnCount: 1,

      flipped: [],
      failedCountInRound: 0,

      players: {
        [socket.id]: {
          socketId: socket.id,
          nickname,
          score: 0,
          streak: 0,
          disconnectedAt: null
        }
      }
    };

    socket.join(roomId);
    io.emit("roomList", rooms);
  });

  /* ---------- 방 참가 ---------- */
  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started || !nickname) return;

    // 재접속 처리
    const existing = Object.values(room.players)
      .find(p => p.nickname === nickname);

    if (existing) {
      delete room.players[existing.socketId];
      existing.socketId = socket.id;
      existing.disconnectedAt = null;
      room.players[socket.id] = existing;
      room.order = room.order.map(id =>
        id === existing.socketId ? socket.id : id
      );
    } else {
      room.players[socket.id] = {
        socketId: socket.id,
        nickname,
        score: 0,
        streak: 0,
        disconnectedAt: null
      };
      room.order.push(socket.id);
    }

    socket.join(roomId);
    io.emit("roomList", rooms);
    io.to(roomId).emit("roomUpdate", room);
  });

  /* ---------- 게임 시작 (방장만) ---------- */
  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;

    room.started = true;
    io.emit("roomList", rooms);

    io.to(roomId).emit("gameStarted", {
      deck: room.deck,
      players: room.players,
      order: room.order,
      currentPlayer: room.order[room.turnIndex],
      turnCount: room.turnCount
    });
  });

  /* ---------- 카드 뒤집기 ---------- */
  socket.on("flipCard", ({ roomId, card }) => {
    const room = rooms[roomId];
    if (!room) return;

    const currentPlayer = room.order[room.turnIndex];
    if (socket.id !== currentPlayer) return;
    if (room.flipped.length >= 2) return;

    room.flipped.push(card);
    io.to(roomId).emit("cardFlipped", card);

    if (room.flipped.length < 2) return;

    const [a, b] = room.flipped;
    const player = room.players[currentPlayer];
    const isMatch = a.value === b.value;

    if (isMatch) {
      player.streak += 1;
      player.score += player.streak;

      io.to(roomId).emit("pairMatched", {
        cards: [a.id, b.id],
        playerId: currentPlayer,
        score: player.score,
        streak: player.streak
      });

      // 카드 제거
      room.deck = room.deck.filter(
        c => c.id !== a.id && c.id !== b.id
      );
    } else {
      player.streak = 0;

      io.to(roomId).emit("pairFailed", [a.id, b.id]);

      // 실패 시 차례 이동
      room.turnIndex = (room.turnIndex + 1) % room.order.length;
      room.failedCountInRound++;
    }

    room.flipped = [];

    // 턴 증가 조건 (모든 플레이어가 1번씩 실패)
    if (room.failedCountInRound >= room.order.length) {
      room.turnCount++;
      room.failedCountInRound = 0;
    }

    io.to(roomId).emit("turnUpdate", {
      currentPlayer: room.order[room.turnIndex],
      turnCount: room.turnCount,
      players: room.players
    });

    // 게임 종료
    if (room.deck.length === 0) {
      io.to(roomId).emit("gameEnded", room.players);
    }
  });

  /* ---------- 연결 끊김 (즉시 삭제 ❌) ---------- */
  socket.on("disconnect", () => {
    for (const id in rooms) {
      const room = rooms[id];
      const player = room.players[socket.id];
      if (player) {
        player.disconnectedAt = Date.now();
        console.log("임시 연결 끊김:", player.nickname);
      }
    }
  });

  socket.on("restartGame", roomId => {
     const room = rooms[roomId];
     if (!room) return;
   
     // 방장만 가능
     if (room.host !== socket.id) return;
   
     // 게임 상태 초기화
     room.started = true;
     room.deck = createDeck();
     room.turnIndex = 0;
     room.turnCount = 1;
     room.flipped = [];
     room.failedCountInRound = 0;
   
     // 플레이어 점수 초기화
     Object.values(room.players).forEach(p => {
       p.score = 0;
       p.streak = 0;
     });
   
     io.to(roomId).emit("gameStarted", {
       deck: room.deck,
       players: room.players,
       order: room.order,
       currentPlayer: room.order[room.turnIndex],
       turnCount: room.turnCount
     });
   });

   socket.on("leaveRoom", roomId => {
     const room = rooms[roomId];
     if (!room) return;
   
     delete room.players[socket.id];
     room.order = room.order.filter(id => id !== socket.id);
   
     // 방장 위임
     if (room.host === socket.id) {
       room.host = room.order[0] || null;
     }
   
     socket.leave(roomId);
   
     if (room.order.length === 0) {
       delete rooms[roomId];
     } else {
       io.to(roomId).emit("roomUpdate", room);
     }
   
     io.emit("roomList", rooms);
   });

   socket.on("singlePlayGameEnd", async (data) => {
     const { nickname, turns, playTime, mode, playerCount } = data;
   
     // 1️⃣ 1인 플레이만 기록
     if (playerCount !== 1) return;
   
     // 2️⃣ 최소 검증 (기존 로직 영향 ❌)
     if (!nickname) return;
     if (turns <= 0 || playTime <= 0) return;
   
     try {
       await db.collection("singlePlayRankings").add({
         nickname,
         turns,
         playTime,
         mode,
         createdAt: admin.firestore.FieldValue.serverTimestamp(),
       });
   
       console.log("✅ ranking saved:", nickname, turns, playTime);
     } catch (err) {
       console.error("❌ ranking save error:", err);
     }
   });

   socket.on("getSinglePlayRankings", async () => {
     try {
       const snapshot = await db
         .collection("singlePlayRankings")
         .orderBy("turns", "asc")
         .orderBy("playTime", "asc")
         .limit(50)
         .get();
   
       const rankings = snapshot.docs.map(doc => doc.data());
   
       socket.emit("singlePlayRankings", rankings);
     } catch (err) {
       console.error("ranking load error", err);
     }
   });

});

/* ===============================
   1분 초과 재접속 실패 시 정리
================================ */
setInterval(() => {
  const now = Date.now();

  for (const id in rooms) {
    const room = rooms[id];

    for (const sid in room.players) {
      const p = room.players[sid];

      if (p.disconnectedAt && now - p.disconnectedAt > RECONNECT_LIMIT) {
        delete room.players[sid];
        room.order = room.order.filter(pid => pid !== sid);

        if (room.host === sid) {
          room.host = room.order[0] || null;
        }
      }
    }

    if (room.order.length === 0) {
      delete rooms[id];
    }
  }

  io.emit("roomList", rooms);
}, 5000);

/* ===============================
   서버 시작
================================ */
server.listen(PORT, () => {
  console.log("Server running on", PORT);
});










