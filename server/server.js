const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
let roomCounter = 1;
const rooms = {};

/* 업로드 */
const upload = multer({
  dest: path.join(__dirname, "uploads")
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* 정적 */
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

/* 카드 생성 */
function createDeck(style) {
  if (style.type === "number") {
    return Array.from({ length: 24 }).flatMap((_, i) => ([
      { id: `${i}-a`, value: i + 1 },
      { id: `${i}-b`, value: i + 1 }
    ])).sort(() => Math.random() - 0.5);
  }

  if (style.type === "image") {
    return Array.from({ length: 24 }).flatMap((_, i) => ([
      { id: `${i}-a`, value: style.imageUrl },
      { id: `${i}-b`, value: style.imageUrl }
    ])).sort(() => Math.random() - 0.5);
  }

  const emojis = ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
    "🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"];

  return emojis.flatMap((e, i) => [
    { id: `${i}-a`, value: e },
    { id: `${i}-b`, value: e }
  ]).sort(() => Math.random() - 0.5);
}

/* 방 목록 */
function broadcastRoomList() {
  io.emit("roomListUpdate",
    Object.entries(rooms).map(([id, r]) => ({
      roomId: id,
      name: r.name,
      players: Object.keys(r.players).length,
      started: r.started
    }))
  );
}

/* 방 생성 (HTTP) */
app.post("/create-room", upload.single("image"), (req, res) => {
  const { nickname, cardStyleType } = req.body;
  if (!nickname) return res.status(400).end();

  const roomId = Math.random().toString(36).slice(2, 7);
  const name = `메모리게임${roomCounter++}`;

  const cardStyle = { type: cardStyleType };
  if (cardStyleType === "image") {
    cardStyle.imageUrl = `/uploads/${req.file.filename}`;
  }

  rooms[roomId] = {
    name,
    host: null,
    started: false,
    cardStyle,
    deck: createDeck(cardStyle),
    removedCards: [],
    players: {},
    order: [],
    turnIndex: 0,
    turnCount: 1,
    flipped: []
  };

  res.json({ roomId });
});

/* 소켓 */
io.on("connection", socket => {

  socket.emit("roomListUpdate", Object.entries(rooms).map(([id, r]) => ({
    roomId: id,
    name: r.name,
    players: Object.keys(r.players).length,
    started: r.started
  })));

  socket.on("registerHost", ({ roomId, nickname }) => {
    const r = rooms[roomId];
    if (!r) return;

    r.host = socket.id;
    r.players[socket.id] = { nickname, score: 0, streak: 0 };
    r.order.push(socket.id);
    socket.join(roomId);

    socket.emit("roomJoined", r);
    broadcastRoomList();
  });

  socket.on("joinRoom", ({ roomId, nickname }) => {
    const r = rooms[roomId];
    if (!r || r.started) return;

    r.players[socket.id] = { nickname, score: 0, streak: 0 };
    r.order.push(socket.id);
    socket.join(roomId);

    io.to(roomId).emit("roomJoined", r);
    broadcastRoomList();
  });

  socket.on("startGame", roomId => {
    const r = rooms[roomId];
    if (!r || socket.id !== r.host) return;

    r.started = true;
    io.to(roomId).emit("gameStarted", {
      deck: r.deck,
      removedCards: [],
      cardStyle: r.cardStyle,
      currentPlayer: r.order[r.turnIndex]
    });
    broadcastRoomList();
  });

  socket.on("flipCard", ({ roomId, card }) => {
    const r = rooms[roomId];
    if (!r) return;

    const current = r.order[r.turnIndex];
    if (socket.id !== current) return;
    if (r.flipped.length >= 2) return;
    if (r.removedCards.includes(card.id)) return;

    r.flipped.push(card);
    io.to(roomId).emit("cardFlipped", card);

    if (r.flipped.length < 2) return;

    const [a, b] = r.flipped;
    const player = r.players[current];

    if (a.value === b.value) {
      player.streak++;
      player.score += player.streak;

      r.removedCards.push(a.id, b.id);

      io.to(roomId).emit("pairMatched", {
        cards: [a.id, b.id],
        players: r.players
      });
    } else {
      player.streak = 0;
      io.to(roomId).emit("pairFailed", [a.id, b.id]);
      r.turnIndex = (r.turnIndex + 1) % r.order.length;
    }

    r.flipped = [];

    io.to(roomId).emit("turnUpdate", {
      currentPlayer: r.order[r.turnIndex],
      turnCount: r.turnCount,
      players: r.players
    });

    if (r.removedCards.length === r.deck.length) {
      io.to(roomId).emit("gameEnded", r.players);
    }
  });
});

server.listen(PORT, () => {
  console.log("Server running:", PORT);
});
