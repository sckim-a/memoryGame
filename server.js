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
function createDeck(mode, images = []) {
  let base = [];

  if (mode === 'emoji') {
    base = [
      '🍎','🍌','🐶','🚗','⚽','🎮','🎧','📱',
      '🧠','🔥','🌈','⭐','🎲','🎯','🎵','🎨',
      '🚀','🛸','🐱','🐸','🍕','🍔','🍩','🍓'
    ];
  } 
  else if (mode === 'image') {
    base = images.slice(0, 24);
  } 
  else {
    base = Array.from({ length: 24 }, (_, i) => i + 1);
  }

  // ⭐ 무조건 24개 확보
  base = base.slice(0, 24);

  const deck = [...base, ...base] // 24쌍
    .sort(() => Math.random() - 0.5)
    .map(v => ({
      value: v,
      open: false,
      removed: false
    }));

  return deck;
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
  
    // 🔒 2장 열려있으면 더 못 누름
    if (room.openCards.length === 2) return;
  
    const card = room.cards[index];
    if (card.open || card.removed) return;
  
    card.open = true;
    room.openCards.push(index);
  
    io.to(roomId).emit('updateBoard', room);
  
    if (room.openCards.length === 2) {
      const [a, b] = room.openCards;
      const c1 = room.cards[a];
      const c2 = room.cards[b];
  
      if (c1.value === c2.value) {
        // ✅ 맞췄을 때
        c1.removed = true;
        c2.removed = true;
        room.openCards = [];
        room.combo++;
  
        room.players[room.currentPlayer].score += room.combo;
  
        io.to(roomId).emit('updateBoard', room);
      } 
      else {
        // ❌ 틀렸을 때
        room.combo = 0;
  
        setTimeout(() => {
          c1.open = false;
          c2.open = false;
          room.openCards = [];
  
          room.currentPlayer =
            (room.currentPlayer + 1) % room.players.length;
  
          if (room.currentPlayer === 0) room.turn++;
  
          io.to(roomId).emit('updateBoard', room);
        }, 800);
      }
    }
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

