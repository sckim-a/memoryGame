const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static('public'));

const rooms = {};

// 카드 덱 생성
function createDeck(mode) {
  let base;

  if (mode === 'emoji') {
    base = ['🍎','🍌','🐶','🚗','⚽','🎮','🎧','📱'];
  } else {
    base = Array.from({ length: 8 }, (_, i) => i + 1);
  }

  const values = [...base, ...base];
  return values
    .sort(() => Math.random() - 0.5)
    .map(v => ({ value: v, open: false, removed: false }));
}

io.on('connection', socket => {
  socket.on('createRoom', ({ nickname, title, maxPlayers, mode }) => {
    const id = Math.random().toString(36).slice(2, 8);

    rooms[id] = {
      id,
      title,
      mode,
      maxPlayers,
      host: socket.id,
      started: false,
      turnIndex: 0,
      players: [],
      cards: []
    };

    io.emit('roomList', Object.values(rooms));
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.players.length >= room.maxPlayers) return;

    room.players.push({
      id: socket.id,
      nickname,
      score: 0
    });

    socket.join(roomId);
    io.to(roomId).emit('roomUpdate', room);
    io.emit('roomList', Object.values(rooms));
  });

  socket.on('startGame', roomId => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.host) return;

    room.started = true;
    room.cards = createDeck(room.mode);

    io.to(roomId).emit('gameStarted', room);
  });

  socket.on('flipCard', ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const card = room.cards[index];
    if (card.open || card.removed) return;

    card.open = true;
    io.to(roomId).emit('roomUpdate', room);
  });

  socket.on('disconnect', () => {
    for (const id in rooms) {
      rooms[id].players = rooms[id].players.filter(p => p.id !== socket.id);
      if (rooms[id].players.length === 0) delete rooms[id];
    }
    io.emit('roomList', Object.values(rooms));
  });
});

server.listen(3000, () => {
  console.log('✅ Server running on http://localhost:3000');
});
