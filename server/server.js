const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

/* ===== 게임 상태 ===== */
const rooms = {};

function createDeck() {
  const emojis = ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
    "🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐞","🐢","🐙","🦀","🐬"];
  return emojis.flatMap((e,i)=>[
    { id:`${i}-a`, value:e },
    { id:`${i}-b`, value:e }
  ]).sort(()=>Math.random()-0.5);
}

function broadcastRoomList() {
  const list = Object.entries(rooms).map(([id, r]) => ({
    roomId: id,
    players: Object.keys(r.players).length,
    started: r.started
  }));
  io.emit("roomListUpdate", list);
}

io.on("connection", socket => {
  console.log("connected:", socket.id);

  socket.emit("roomListUpdate", []);

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
      players: rooms[roomId].players,
      host: rooms[roomId].host
    });

    broadcastRoomList();
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
      players: room.players,
      host: room.host
    });

    broadcastRoomList();
  });

  /* 게임 시작 (방장만 가능) */
  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return;

    room.started = true;

    io.to(roomId).emit("gameStarted", {
      deck: room.deck,
      currentPlayer: room.playerOrder[room.turnIndex]
    });

    broadcastRoomList();
  });

  /* 카드 뒤집기 */
  socket.on("flipCard", ({ roomId, card }) => {
    const room = rooms[roomId];
    if (!room) return;

    const current = room.playerOrder[room.turnIndex];
    if (socket.id !== current) return;
    if (room.flipped.length >= 2) return;

    room.flipped.push(card);
    io.to(roomId).emit("cardFlipped", card);

    if (room.flipped.length < 2) return;

    const [a,b] = room.flipped;
    const player = room.players[current];
    const match = a.value === b.value;

    if (match) {
      player.streak++;
      player.score += player.streak;
      io.to(roomId).emit("pairMatched", { cards:[a.id,b.id] });
      room.deck = room.deck.filter(c=>c.id!==a.id&&c.id!==b.id);
    } else {
      player.streak = 0;
      io.to(roomId).emit("pairFailed",[a.id,b.id]);
      room.turnIndex = (room.turnIndex+1)%room.playerOrder.length;
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
    for (const id in rooms) {
      const r = rooms[id];
      if (!r.players[socket.id]) continue;

      delete r.players[socket.id];
      r.playerOrder = r.playerOrder.filter(p=>p!==socket.id);

      if (r.playerOrder.length === 0) delete rooms[id];
    }
    broadcastRoomList();
  });
});

server.listen(PORT, ()=>console.log("Server on",PORT));
