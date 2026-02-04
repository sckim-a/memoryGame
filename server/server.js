const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/* 정적 */
app.use(express.static(path.join(__dirname, "../client")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

/* ===== 게임 상태 ===== */
let rooms = {};
let roomSeq = 1;

function createDeck(style = "emoji") {
  const emojis = [
    "🐶","🐱","🦊","🐻","🐼","🐨",
    "🐯","🦁","🐮","🐷","🐸","🐵",
    "🐔","🐧","🐦","🐤","🦄","🐝",
    "🦋","🐞","🐢","🐙","🦀","🐬"
  ];

  return emojis.flatMap((v, i) => ([
    { id: `${i}-a`, value: v, style },
    { id: `${i}-b`, value: v, style }
  ])).sort(() => Math.random() - 0.5);
}

function emitRoomList() {
  io.emit(
    "roomList",
    Object.values(rooms).map((r, idx) => ({
      roomId: r.roomId,
      name: `메모리게임${idx + 1}`,
      players: Object.keys(r.players).length,
      started: r.started
    }))
  );
}

io.on("connection", socket => {
  console.log("connected:", socket.id);

  socket.on("createRoom", ({ nickname, cardStyle }) => {
    const roomId = `room-${roomSeq++}`;

    rooms[roomId] = {
      roomId,
      host: socket.id,
      started: false,
      cardStyle,
      deck: createDeck(cardStyle),
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

  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;

    room.players[socket.id] = { nickname, score: 0, streak: 0 };
    room.order.push(socket.id);

    socket.join(roomId);
    socket.emit("roomJoined", roomId);
    emitRoomList();
  });

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

  socket.on("flipCard", ({ roomId, card }) => {
    const room = rooms[roomId];
    if (!room) return;

    const current = room.order[room.turnIndex];
    if (socket.id !== current) return;
    if (room.flipped.length >= 2) return;

    room.flipped.push(card);
    io.to(roomId).emit("cardFlipped", card);

    if (room.flipped.length < 2) return;

    const [a, b] = room.flipped;
    const player = room.players[current];

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

  socket.on("disconnect", () => {
    for (const id in rooms) {
      const r = rooms[id];
      if (!r.players[socket.id]) continue;

      delete r.players[socket.id];
      r.order = r.order.filter(p => p !== socket.id);

      if (r.order.length === 0) delete rooms[id];
      else if (r.host === socket.id) r.host = r.order[0];
    }
    emitRoomList();
  });
});

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});
