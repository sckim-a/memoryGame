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
const rooms = {};

function createDeck() {
  const emojis = ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
                  "🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"];
  const deck = emojis.flatMap((e, i) => [
    { id: `${i}-a`, value: e },
    { id: `${i}-b`, value: e }
  ]);
  return deck.sort(() => Math.random() - 0.5);
}

io.on("connection", socket => {
  console.log("connected:", socket.id);

  /* 방 생성 */
  socket.on("createRoom", ({ nickname }) => {
    const roomId = Math.random().toString(36).slice(2, 7);

    rooms[roomId] = {
      host: socket.id,
      started: false,
      deck: createDeck(),
      players: {
        [socket.id]: { nickname, score: 0, streak: 0 }
      },
      playerOrder: [socket.id],
      turnIndex: 0,
      turnCount: 1,
      failedCountInRound: 0,
      flipped: []
    };

    socket.join(roomId);
    socket.emit("roomJoined", {
      roomId,
      players: rooms[roomId].players
    });

    console.log("room created:", roomId);
  });

  /* 방 참가 */
  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;

    room.players[socket.id] = { nickname, score: 0, streak: 0 };
    room.playerOrder.push(socket.id);

    socket.join(roomId);
    io.to(roomId).emit("roomJoined", {
      roomId,
      players: room.players
    });
  });

  /* 게임 시작 */
  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room) return;

    room.started = true;
    io.to(roomId).emit("gameStarted", {
      deck: room.deck,
      currentPlayer: room.playerOrder[room.turnIndex]
    });
  });

  /* 카드 뒤집기 */
  socket.on("flipCard", ({ roomId, card }) => {
    const room = rooms[roomId];
    if (!room) return;

    const currentPlayer = room.playerOrder[room.turnIndex];
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
      io.to(roomId).emit("pairMatched", { cards: [a.id, b.id] });
      room.deck = room.deck.filter(c => c.id !== a.id && c.id !== b.id);
    } else {
      player.streak = 0;
      io.to(roomId).emit("pairFailed", [a.id, b.id]);
      room.turnIndex = (room.turnIndex + 1) % room.playerOrder.length;
      room.failedCountInRound++;
    }

    room.flipped = [];

    if (room.failedCountInRound >= room.playerOrder.length) {
      room.turnCount++;
      room.failedCountInRound = 0;
    }

    io.to(roomId).emit("turnUpdate", {
      currentPlayer: room.playerOrder[room.turnIndex],
      turnCount: room.turnCount,
      players: room.players
    });

    if (room.deck.length === 0) {
      io.to(roomId).emit("gameEnded", room.players);
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room.players[socket.id]) continue;

      delete room.players[socket.id];
      room.playerOrder = room.playerOrder.filter(id => id !== socket.id);

      if (room.playerOrder.length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});
