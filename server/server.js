const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/* ===== 정적 파일 ===== */
app.use(express.static(path.join(__dirname, "../client")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

/* ===== 업로드 설정 ===== */
const upload = multer({
  dest: path.join(__dirname, "uploads")
});

/* ===== 게임 상태 ===== */
let rooms = {};
let roomSeq = 1;

function createDeck() {
  const emojis = [
    "🐶","🐱","🦊","🐻","🐼","🐨",
    "🐯","🦁","🐮","🐷","🐸","🐵",
    "🐔","🐧","🐦","🐤","🦄","🐝",
    "🦋","🐞","🐢","🐙","🦀","🐬"
  ];

  return emojis.flatMap((e, i) => ([
    { id: `${i}-a`, value: e },
    { id: `${i}-b`, value: e }
  ])).sort(() => Math.random() - 0.5);
}

/* ===== 방 목록 브로드캐스트 ===== */
function emitRoomList() {
  const list = Object.values(rooms).map((r, idx) => ({
    roomId: r.roomId,
    name: `메모리게임${idx + 1}`,
    players: Object.keys(r.players).length,
    started: r.started
  }));
  io.emit("roomList", list);
}

/* ===== Socket ===== */
io.on("connection", socket => {
  console.log("connected:", socket.id);

  /* 방 생성 */
  socket.on("createRoom", ({ nickname }) => {
    const roomId = "room-" + roomSeq++;

    rooms[roomId] = {
      roomId,
      host: socket.id,
      started: false,
      deck: createDeck(),
      players: {
        [socket.id]: { nickname, score: 0, streak: 0 }
      },
      order: [socket.id],
      turnIndex: 0,
      turnCount: 1,
      flipped: []
    };

    socket.join(roomId);
    socket.emit("roomJoined", roomId);
    emitRoomList();
  });

  /* 방 참가 */
  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;

    room.players[socket.id] = { nickname, score: 0, streak: 0 };
    room.order.push(socket.id);

    socket.join(roomId);
    socket.emit("roomJoined", roomId);
    emitRoomList();
  });

  /* 게임 시작 (방장만) */
  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.host) return;

    room.started = true;

    io.to(roomId).emit("gameStarted", {
      deck: room.deck,
      players: room.players,
      currentPlayer: room.order[room.turnIndex],
      turnCount: room.turnCount
    });

    emitRoomList();
  });

  /* 카드 뒤집기 */
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

    if (a.value === b.value) {
      player.streak += 1;
      player.score += player.streak;

      room.deck = room.deck.filter(
        c => c.id !== a.id && c.id !== b.id
      );

      io.to(roomId).emit("pairMatched", {
        ids: [a.id, b.id],
        players: room.players
      });
    } else {
      player.streak = 0;
      io.to(roomId).emit("pairFailed", [a.id, b.id]);

      room.turnIndex = (room.turnIndex + 1) % room.order.length;
      if (room.turnIndex === 0) room.turnCount++;
    }

    room.flipped = [];

    io.to(roomId).emit("turnUpdate", {
      currentPlayer: room.order[room.turnIndex],
      turnCount: room.turnCount,
      players: room.players
    });

    if (room.deck.length === 0) {
      io.to(roomId).emit("gameEnded", room.players);
    }
  });

  /* 연결 해제 */
  socket.on("disconnect", () => {
    for (const id in rooms) {
      const room = rooms[id];
      if (!room.players[socket.id]) continue;

      delete room.players[socket.id];
      room.order = room.order.filter(p => p !== socket.id);

      if (room.order.length === 0) {
        delete rooms[id];
      } else if (room.host === socket.id) {
        room.host = room.order[0];
      }
    }
    emitRoomList();
  });
});

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});
