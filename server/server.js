const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

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
function createDeck() {
  const emojis = [
    "🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁",
    "🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤",
    "🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"
  ];

  const deck = emojis.flatMap((e, i) => ([
    { id: `${i}-a`, value: e },
    { id: `${i}-b`, value: e }
  ]));

  return deck.sort(() => Math.random() - 0.5);
}

/* ===============================
   Socket 연결
================================ */
io.on("connection", socket => {
  console.log("connected:", socket.id);

  /* ---------- 방 생성 ---------- */
  socket.on("createRoom", ({ nickname, cardStyle }) => {
    if (!nickname) return;

    const roomId = `room-${Date.now()}`;

    rooms[roomId] = {
      id: roomId,
      name: `메모리게임${Object.keys(rooms).length + 1}`,
      host: socket.id,
      started: false,

      cardStyle, // number | emoji | image
      deck: createDeck(),

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
