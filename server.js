import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Map();

/* ---------- 유틸 ---------- */
function createDeck(pairCount = 24) {
  const base = Array.from({ length: pairCount }, (_, i) => i);
  const deck = [...base, ...base]
    .map((pairId, idx) => ({
      id: idx + "-" + Math.random(),
      pairId,
      flipped: false,
      removed: false,
    }))
    .sort(() => Math.random() - 0.5);
  return deck;
}

function nextPlayer(room) {
  const players = room.players.filter(p => p.connected);
  room.turnIndex = (room.turnIndex + 1) % players.length;
  room.currentTurn = players[room.turnIndex].id;
}

/* ---------- 소켓 ---------- */
io.on("connection", socket => {
  socket.on("createRoom", ({ roomName, nickname, maxPlayers }) => {
    const roomId = Math.random().toString(36).slice(2, 8);

    rooms.set(roomId, {
      roomId,
      roomName,
      hostId: socket.id,
      maxPlayers,
      status: "LOBBY",
      players: [{
        id: socket.id,
        nickname,
        score: 0,
        combo: 0,
        connected: true,
        joinedAt: Date.now(),
      }],
    });

    socket.join(roomId);
    io.emit("roomList", [...rooms.values()]);
    socket.emit("joinedRoom", rooms.get(roomId));
  });

  socket.on("joinRoom", ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== "LOBBY") return;

    room.players.push({
      id: socket.id,
      nickname,
      score: 0,
      combo: 0,
      connected: true,
      joinedAt: Date.now(),
    });

    socket.join(roomId);
    io.emit("roomList", [...rooms.values()]);
    io.to(roomId).emit("roomUpdated", room);
  });

  socket.on("startGame", roomId => {
    const room = rooms.get(roomId);
    if (!room || socket.id !== room.hostId) return;

    room.status = "IN_GAME";
    room.deck = createDeck();
    room.opened = [];
    room.turnIndex = 0;
    room.currentTurn = room.players[0].id;

    io.to(roomId).emit("gameStarted", room);
    io.emit("roomList", [...rooms.values()]);
  });

  socket.on("flipCard", ({ roomId, cardId }) => {
    const room = rooms.get(roomId);
    if (!room || room.currentTurn !== socket.id) return;

    const card = room.deck.find(c => c.id === cardId);
    if (!card || card.flipped || card.removed) return;

    card.flipped = true;
    room.opened.push(card);

    io.to(roomId).emit("cardFlipped", card);

    if (room.opened.length === 2) {
      const [a, b] = room.opened;
      const player = room.players.find(p => p.id === socket.id);

      if (a.pairId === b.pairId) {
        a.removed = b.removed = true;
        player.combo += 1;
        player.score += player.combo;

        io.to(roomId).emit("pairMatched", {
          cards: [a.id, b.id],
          player,
        });
      } else {
        player.combo = 0;
        setTimeout(() => {
          a.flipped = b.flipped = false;
          io.to(roomId).emit("pairMismatched", [a.id, b.id]);
        }, 700);
        nextPlayer(room);
      }

      room.opened = [];

      if (room.deck.every(c => c.removed)) {
        room.status = "RESULT";
        const ranking = [...room.players].sort((a, b) => b.score - a.score);
        io.to(roomId).emit("gameEnded", ranking);
      }
    }
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const p = room.players.find(p => p.id === socket.id);
      if (p) {
        p.connected = false;
        setTimeout(() => {
          if (!p.connected) {
            room.players = room.players.filter(x => x.id !== socket.id);
            if (room.hostId === socket.id && room.players.length > 0) {
              room.hostId = room.players[0].id;
              io.to(room.roomId).emit("hostChanged", room.hostId);
            }
            io.to(room.roomId).emit("roomUpdated", room);
          }
        }, 60000);
      }
    }
  });
});

server.listen(3000, () => {
  console.log("✅ Server running on http://localhost:3000");
});
