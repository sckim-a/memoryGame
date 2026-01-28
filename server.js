const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let rooms = {};

function createShuffledCards() {
  const pairCount = 24;
  let values = [];
  for (let i = 1; i <= pairCount; i++) values.push(i, i);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values.map((v, i) => ({ id: i, value: v, isFlipped: false, isRemoved: false }));
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ nickname, maxPlayers }) => {
    const roomId = Date.now().toString();
    rooms[roomId] = {
      id: roomId,
      host: nickname,
      maxPlayers,
      players: [{ id: socket.id, name: nickname, score: 0 }],
      status: 'waiting',
      cards: [],
      currentPlayerIndex: 0,
      flipped: [],
      turnCount: 1,
      currentStreak: 0
    };

    socket.join(roomId);
    io.emit('roomList', Object.values(rooms));
    socket.emit('joinedRoom', rooms[roomId]);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.players.length >= room.maxPlayers) return;

    room.players.push({ id: socket.id, name: nickname, score: 0 });
    socket.join(roomId);

    io.to(roomId).emit('roomUpdate', room);

    if (room.players.length === room.maxPlayers) {
      startGame(roomId);
    }
  });

  socket.on('startGame', (roomId) => startGame(roomId));

  function startGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.status = 'playing';
    room.cards = createShuffledCards();
    room.currentPlayerIndex = 0;
    room.turnCount = 1;
    room.currentStreak = 0;
    room.flipped = [];

    io.to(roomId).emit('gameState', room);
  }

  socket.on('flipCard', ({ roomId, cardId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.currentPlayerIndex];
    if (player.id !== socket.id) return;

    const card = room.cards.find(c => c.id === cardId);
    if (!card || card.isFlipped || card.isRemoved) return;

    card.isFlipped = true;
    room.flipped.push(card);

    if (room.flipped.length === 2) {
      const [c1, c2] = room.flipped;
      if (c1.value === c2.value) {
        room.currentStreak++;
        player.score += room.currentStreak;
        c1.isRemoved = true;
        c2.isRemoved = true;
        room.flipped = [];
      } else {
        room.currentStreak = 0;
        setTimeout(() => {
          c1.isFlipped = false;
          c2.isFlipped = false;
          room.flipped = [];
          nextPlayer(room);
          io.to(roomId).emit('gameState', room);
        }, 800);

        io.to(roomId).emit('gameState', room);
        return;
      }
    }

    io.to(roomId).emit('gameState', room);

    const allRemoved = room.cards.every(c => c.isRemoved);
    if (allRemoved) {
      io.to(roomId).emit('gameEnd', room);
      delete rooms[roomId];
      io.emit('roomList', Object.values(rooms));
    }
  });

  function nextPlayer(room) {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    room.currentStreak = 0;
    if (room.currentPlayerIndex === 0) room.turnCount++;
  }

  socket.on('disconnect', () => {
    Object.values(rooms).forEach(room => {
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) delete rooms[room.id];
    });
    io.emit('roomList', Object.values(rooms));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on', PORT));
