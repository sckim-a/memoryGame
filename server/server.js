const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const RECONNECT_LIMIT = 60 * 1000;

/* ================= static ================= */
app.use(express.static(path.join(__dirname, "../client")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

/* ================= upload ================= */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (_, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({ storage });

app.post("/upload", upload.single("image"), (req, res) => {
  res.json({ url: "/uploads/" + req.file.filename });
});

/* ================= game state ================= */
const rooms = {};

function createDeck(style, imageUrl) {
  const emojis = ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"];
  let values;
  if (style === "number") values = Array.from({ length: 24 }, (_, i) => i + 1);
  if (style === "emoji") values = emojis;
  if (style === "image") values = Array.from({ length: 24 }, () => imageUrl);

  return values.flatMap((v, i) => ([
    { id: i + "a", value: v },
    { id: i + "b", value: v }
  ])).sort(() => Math.random() - 0.5);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ nickname, cardStyle, imageUrl }) => {
    const id = "room-" + Date.now();
    rooms[id] = {
      id,
      name: `메모리게임${Object.keys(rooms).length + 1}`,
      host: socket.id,
      started: false,
      cardStyle,
      imageUrl,
      deck: createDeck(cardStyle, imageUrl),
      order: [socket.id],
      turnIndex: 0,
      turnCount: 1,
      flipped: [],
      failedCount: 0,
      players: {
        [socket.id]: { socketId: socket.id, nickname, score: 0, streak: 0, disconnectedAt: null }
      }
    };
    socket.join(id);
    io.emit("roomList", rooms);
    io.to(id).emit("roomUpdate", rooms[id]);
  });

  socket.on("joinRoom", ({ roomId, nickname }) => {
    const r = rooms[roomId];
    if (!r || r.started) return;

    r.players[socket.id] = { socketId: socket.id, nickname, score: 0, streak: 0, disconnectedAt: null };
    r.order.push(socket.id);
    socket.join(roomId);

    io.emit("roomList", rooms);
    io.to(roomId).emit("roomUpdate", r);
  });

  socket.on("startGame", roomId => {
    const r = rooms[roomId];
    if (!r || r.host !== socket.id) return;
    r.started = true;
    io.emit("roomList", rooms);
    io.to(roomId).emit("gameStarted", r);
  });

  socket.on("flipCard", ({ roomId, card }) => {
    const r = rooms[roomId];
    if (!r) return;
    const current = r.order[r.turnIndex];
    if (socket.id !== current || r.flipped.length >= 2) return;

    r.flipped.push(card);
    io.to(roomId).emit("cardFlipped", card);

    if (r.flipped.length < 2) return;

    const [a, b] = r.flipped;
    const p = r.players[current];

    if (a.value === b.value) {
      p.streak++;
      p.score += p.streak;
      io.to(roomId).emit("pairMatched", { cards: [a.id, b.id], players: r.players });
      r.deck = r.deck.filter(c => c.id !== a.id && c.id !== b.id);
    } else {
      p.streak = 0;
      io.to(roomId).emit("pairFailed", [a.id, b.id]);
      r.turnIndex = (r.turnIndex + 1) % r.order.length;
      r.failedCount++;
    }

    r.flipped = [];
    if (r.failedCount >= r.order.length) {
      r.turnCount++;
      r.failedCount = 0;
    }

    io.to(roomId).emit("turnUpdate", { currentPlayer: r.order[r.turnIndex], turnCount: r.turnCount, players: r.players });

    if (r.deck.length === 0) io.to(roomId).emit("gameEnded", r.players);
  });

  socket.on("restartGame", roomId => {
    const r = rooms[roomId];
    if (!r) return;
    r.deck = createDeck(r.cardStyle, r.imageUrl);
    r.turnIndex = 0;
    r.turnCount = 1;
    r.failedCount = 0;
    r.flipped = [];
    Object.values(r.players).forEach(p => { p.score = 0; p.streak = 0; });
    io.to(roomId).emit("gameStarted", r);
  });

  socket.on("leaveRoom", roomId => {
    const r = rooms[roomId];
    if (!r) return;
    delete r.players[socket.id];
    r.order = r.order.filter(id => id !== socket.id);
    if (r.host === socket.id) r.host = r.order[0] || null;
    socket.leave(roomId);
    if (r.order.length === 0) delete rooms[roomId];
    io.emit("roomList", rooms);
  });
});

server.listen(PORT, () => console.log("Server running", PORT));
