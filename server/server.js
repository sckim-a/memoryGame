const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/* ===== static ===== */
app.use(express.static(path.join(__dirname, "../client")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ===== upload ===== */
const upload = multer({
  dest: path.join(__dirname, "uploads")
});

app.post("/upload", upload.array("images", 24), (req, res) => {
  const files = req.files.map(f => "/uploads/" + f.filename);
  res.json(files);
});

/* ===== game state ===== */
let rooms = {};
let roomCount = 1;

function createDeck(style, images = []) {
  const emojis = ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
                  "🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"];

  let values;
  if (style === "number") {
    values = Array.from({ length: 24 }, (_, i) => i + 1);
  } else if (style === "image") {
    values = images;
  } else {
    values = emojis;
  }

  return values.flatMap((v, i) => [
    { id: i + "-a", value: v, type: style },
    { id: i + "-b", value: v, type: style }
  ]).sort(() => Math.random() - 0.5);
}

/* ===== socket ===== */
io.on("connection", socket => {
  socket.emit("roomList", rooms);

  socket.on("createRoom", ({ nickname, cardStyle, images }) => {
    const roomId = "room-" + roomCount++;
    rooms[roomId] = {
      id: roomId,
      name: `메모리게임${roomCount - 1}`,
      host: socket.id,
      started: false,
      cardStyle,
      deck: createDeck(cardStyle, images),
      players: {
        [socket.id]: { nickname, score: 0, streak: 0 }
      },
      order: [socket.id],
      turnIndex: 0,
      turnCount: 1,
      flipped: []
    };

    socket.join(roomId);
    io.emit("roomList", rooms);
    io.to(roomId).emit("roomUpdate", rooms[roomId]);
  });

  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;

    room.players[socket.id] = { nickname, score: 0, streak: 0 };
    room.order.push(socket.id);
    socket.join(roomId);

    io.emit("roomList", rooms);
    io.to(roomId).emit("roomUpdate", room);
  });

  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.host) return;
    room.started = true;
    io.emit("roomList", rooms);
    io.to(roomId).emit("gameStarted", room.deck);
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
      player.streak++;
      player.score += player.streak;

      io.to(roomId).emit("pairMatched", {
        ids: [a.id, b.id],
        players: room.players
      });

      room.deck = room.deck.filter(c => c.id !== a.id && c.id !== b.id);
    } else {
      player.streak = 0;
      io.to(roomId).emit("pairFailed", [a.id, b.id]);
      room.turnIndex = (room.turnIndex + 1) % room.order.length;
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
      delete r.players[socket.id];
      r.order = r.order.filter(p => p !== socket.id);
      if (r.order.length === 0) delete rooms[id];
      else if (r.host === socket.id) r.host = r.order[0];
    }
    io.emit("roomList", rooms);
  });
});

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});
