const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

function createCards(mode) {
  let values = [];

  if (mode === 'emoji') {
    const emojis = ['🍎','🍌','🍇','🍓','🍒','🥝','🍍','🥑','🍉','🍑','🍋','🍊',
                    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮'];
    values = [...emojis, ...emojis];
  } else {
    for (let i = 1; i <= 24; i++) values.push(i, i);
  }

  return values
    .sort(() => Math.random() - 0.5)
    .map(v => ({ value: v, open: false, removed: false }));
}

function emitRoomList() {
  io.emit('roomList', Object.values(rooms).map(r => ({
    id: r.id,
    title: r.title,
    players: r.players.length,
    maxPlayers: r.maxPlayers,
    status: r.status
  })));
}

io.on('connection', socket => {

  socket.emit('roomList', Object.values(rooms));

  socket.on('createRoom', ({ title, maxPlayers, mode, nickname }) => {
    const id = Math.random().toString(36).substr(2, 5);

    rooms[id] = {
      id,
      title,
      mode,
      maxPlayers,
      hostId: socket.id,
      status: 'waiting',
      players: [{
        id: socket.id,
        nickname,
        score: 0,
        streak: 0,
        flipped: []
      }],
      cards: [],
      turnIndex: 0
    };

    socket.join(id);
    socket.emit('joinedRoom', rooms[id]);
    emitRoomList();
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.players.length >= room.maxPlayers) return;

    room.players.push({
      id: socket.id,
      nickname,
      score: 0,
      streak: 0,
      flipped: []
    });

    socket.join(roomId);
    io.to(roomId).emit('updateRoom', room);
    emitRoomList();
  });

  socket.on('startGame', roomId => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;

    room.status = 'playing';
    room.cards = createCards(room.mode);

    io.to(roomId).emit('gameStarted', room);
    emitRoomList();
  });

  socket.on('flipCard', ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id) return;

    const card = room.cards[index];
    if (card.open || card.removed) return;

    card.open = true;
    player.flipped.push(index);

    io.to(roomId).emit('cardUpdate', room.cards);

    if (player.flipped.length === 2) {
      const [a, b] = player.flipped;
      const c1 = room.cards[a];
      const c2 = room.cards[b];

      if (c1.value === c2.value) {
        c1.removed = c2.removed = true;
        player.streak++;
        player.score += player.streak;
      } else {
        player.streak = 0;
        setTimeout(() => {
          c1.open = c2.open = false;
          room.turnIndex = (room.turnIndex + 1) % room.players.length;
          io.to(roomId).emit('cardUpdate', room.cards);
          io.to(roomId).emit('updateRoom', room);
        }, 800);
      }

      player.flipped = [];
      io.to(roomId).emit('updateRoom', room);
    }
  });

  socket.on('disconnect', () => {
    for (const id in rooms) {
      const room = rooms[id];

      if (room.hostId === socket.id) {
        delete rooms[id];
        emitRoomList();
        return;
      }

      room.players = room.players.filter(p => p.id !== socket.id);
    }
    emitRoomList();
  });
});

server.listen(3000, () => console.log('서버 실행중'));
