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
      players: {
        [socket.id]: { nickname, score: 0, streak: 0 }
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

    flipped.push({ ...card, socketId: socket.id });
    io.to(roomId).emit("cardFlipped", card);

    if (flipped.length === 2) {
      const [a, b] = flipped;
      const player = room.players[socket.id];

      if (a.value === b.value) {
        player.streak += 1;
        player.score += player.streak;

        io.to(roomId).emit("pairMatched", {
          cards: [a.id, b.id],
          playerId: socket.id,
          score: player.score
        });

        room.deck = room.deck.filter(c => c.id !== a.id && c.id !== b.id);

        if (room.deck.length === 0) {
          io.to(roomId).emit("gameEnded", room.players);
        }
      } else {
        player.streak = 0;
        io.to(roomId).emit("pairFailed", [a.id, b.id]);
      }
      flipped = [];
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
