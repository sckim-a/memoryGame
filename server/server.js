const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const RECONNECT_LIMIT = 60 * 1000;

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
   카드 덱
================================ */
function createDeck(style, images = []) {
  let values = [];

  if (style === "number") {
    values = Array.from({ length: 24 }, (_, i) => i + 1);
  } else if (style === "image") {
    values = images.slice(0, 24);
  } else {
    values = [
      "🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁",
      "🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤",
      "🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"
    ];
  }

  const deck = values.flatMap((v, i) => ([
    { id: `${i}-a`, value: v },
    { id: `${i}-b`, value: v }
  ]));

  return deck.sort(() => Math.random() - 0.5);
}

/* ===============================
   Socket
================================ */
io.on("connection", socket => {
  console.log("connected:", socket.id);

  socket.emit("roomList", rooms);

  socket.on("createRoom", ({ nickname, cardStyle, images }) => {
    if (!nickname) return;

    const roomId = `room-${Date.now()}`;

    rooms[roomId] = {
      id: roomId,
      name: `메모리게임${Object.keys(rooms).length + 1}`,
      host: socket.id,
      started: false,
      cardStyle,
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
    io.to(roomId).emit("roomUpdate", rooms[roomId]);
  });

  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started || !nickname) return;

    room.players[socket.id] = {
      socketId: socket.id,
      nickname,
      score: 0,
      streak: 0,
      disconnectedAt: null
    };
    room.order.push(socket.id);

    socket.join(roomId);
    io.emit("roomList", rooms);
    io.to(roomId).emit("roomUpdate", room);
  });

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
    const isMatch = a.value === b.value;

    setTimeout(() => {
      if (isMatch) {
        player.streak++;
        player.score += player.streak;

        io.to(roomId).emit("pairMatched", {
          cards: [a.id, b.id],
          playerId: current,
          score: player.score
        });

        room.deck = room.deck.filter(
          c => c.id !== a.id && c.id !== b.id
        );
      } else {
        player.streak = 0;
        io.to(roomId).emit("pairFailed", [a.id, b.id]);
        room.turnIndex = (room.turnIndex + 1) % room.order.length;
        room.failedCountInRound++;
      }

      room.flipped = [];

      if (room.failedCountInRound >= room.order.length) {
        room.turnCount++;
        room.failedCountInRound = 0;
      }

      io.to(roomId).emit("turnUpdate", {
        currentPlayer: room.order[room.turnIndex],
        turnCount: room.turnCount,
        players: room.players
      });

      if (room.deck.length === 0) {
        io.to(roomId).emit("gameEnded", room.players);
      }
    }, 700);
  });

   /* ---------- 게임 다시하기 ---------- */
   socket.on("restartGame", roomId => {
     const room = rooms[roomId];
     if (!room || room.host !== socket.id) return;
   
     room.started = true;
     room.deck = createDeck(room.cardStyle);
     room.turnIndex = 0;
     room.turnCount = 1;
     room.flipped = [];
     room.failedCountInRound = 0;
   
     Object.values(room.players).forEach(p => {
       p.score = 0;
       p.streak = 0;
     });
   
     io.to(roomId).emit("gameStarted", {
       deck: room.deck,
       players: room.players,
       order: room.order,
       currentPlayer: room.order[0],
       turnCount: room.turnCount
     });
   });

  socket.on("disconnect", () => {
    for (const id in rooms) {
      const r = rooms[id];
      if (r.players[socket.id]) {
        r.players[socket.id].disconnectedAt = Date.now();
      }
    }
  });
});

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});

