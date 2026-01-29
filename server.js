const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

function createDeck(mode) {
  let base = [];

  if (mode === 'emoji') {
    base = [
      '🍎','🍌','🐶','🚗','⚽','🎮','🎧','📱',
      '🧠','🔥','🌈','⭐','🎲','🎯','🎵','🎨',
      '🚀','🛸','🐱','🐸','🍕','🍔','🍩','🍓'
    ];
  } else {
    base = Array.from({ length: 24 }, (_, i) => i + 1);
  }

  return [...base, ...base]
    .sort(() => Math.random() - 0.5)
    .map(v => ({
      value: v,
      open: false,
      removed: false
    }));
}

io.on('connection', socket => {
  socket.emit('roomList', Object.values(rooms));

  socket.on('createRoom', ({ nickname, title, maxPlayers, mode }) => {
    const id = Math.random().toString(36).slice(2, 6);

    rooms[id] = {
      id,
      title,
      mode,
      maxPlayers,
      host: socket.id,
      started: false,
      status: 'waiting', // waiting | playing
      turn: 1,
      currentPlayer: 0,
      combo: 0,
      openCards: [],
      cards: [],
      players: [{
        id: socket.id,
        name: nickname,
        score: 0
      }]
    };

    socket.join(id);
    socket.emit('joinedRoom', rooms[id]);
    io.emit('roomList', Object.values(rooms));
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.started) return;
    if (room.players.length >= room.maxPlayers) return;

    room.players.push({
      id: socket.id,
      name: nickname,
      score: 0
    });

    socket.join(roomId);
    io.to(roomId).emit('roomUpdate', room);
    io.emit('roomList', Object.values(rooms));
  });

  socket.on('startGame', roomId => {
    const room = rooms[roomId];
    if (!room || room.started) return;

    room.started = true;
    room.cards = createDeck(room.mode);
    io.to(roomId).emit('roomUpdate', room);
  });

  socket.on('flipCard', ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;
    if (room.openCards.length === 2) return;

    const card = room.cards[index];
    if (card.open || card.removed) return;

    card.open = true;
    room.openCards.push(index);
    io.to(roomId).emit('roomUpdate', room);

    if (room.openCards.length === 2) {
      const [a, b] = room.openCards;
      const c1 = room.cards[a];
      const c2 = room.cards[b];

      if (c1.value === c2.value) {
        c1.removed = c2.removed = true;
        room.combo++;
        room.players[room.currentPlayer].score += room.combo;
        room.openCards = [];
        io.to(roomId).emit('roomUpdate', room);
      } else {
        room.combo = 0;
        setTimeout(() => {
          c1.open = c2.open = false;
          room.openCards = [];
          room.currentPlayer =
            (room.currentPlayer + 1) % room.players.length;
          if (room.currentPlayer === 0) room.turn++;
          io.to(roomId).emit('roomUpdate', room);
        }, 800);
      }
    }
  });
});

server.listen(3000, () =>
  console.log('http://localhost:3000')
);

