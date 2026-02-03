// server.js (v2)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// ======================
// 상태
// ======================
const rooms = {};

function createDeck(mode) {
  let values = [];
  if (mode === 'emoji') {
    const emojis = ['🍎','🍌','🍇','🍉','🍒','🍓','🥝','🍍','🥑','🍑','🍋','🍊','🥥','🍅','🌽','🥕','🥔','🍆','🥦','🥬','🌶️','🧄','🧅','🍄'];
    values = emojis.slice(0,24);
  } else {
    for (let i = 1; i <= 24; i++) values.push(i);
  }

  const deck = [...values, ...values]
    .sort(() => Math.random() - 0.5)
    .map(v => ({ value: v, open: false, removed: false }));

  return deck;
}

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    title: r.title,
    players: r.players.length,
    max: r.maxPlayers,
    mode: r.mode,
    status: r.started ? '진행중' : '대기중'
  }));
}

io.on('connection', (socket) => {
  socket.emit('roomList', getRoomList());

  socket.on('requestRoomList', () => {
    socket.emit('roomList', getRoomList());
  });

  socket.on('createRoom', ({ nickname, title, maxPlayers, mode }) => {
    const id = Math.random().toString(36).substring(2, 6);

    rooms[id] = {
    id,
    title: title || '메모리 게임', // ⭐ 기본값
    mode: mode || 'number',
    maxPlayers: maxPlayers || 4,
    host: socket.id,
    started: false,
    turn: 1,
    currentPlayer: 0,
    combo: 0,
    openCards: [],
    cards: [],
    players: [{ id: socket.id, name: nickname, score: 0 }]
  };

    socket.join(id);
    socket.emit('joinedRoom', rooms[id]);
    io.emit('roomList', getRoomList());
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room || room.players.length >= room.maxPlayers) return;

    socket.join(roomId);
    room.players.push({ id: socket.id, name: nickname, score: 0 });

    io.to(roomId).emit('joinedRoom', room);
    io.emit('roomList', getRoomList());

    if (room.players.length === room.maxPlayers) startGame(roomId);
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;
    startGame(roomId);
  });

  socket.on('flipCard', ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const card = room.cards[index];
    if (!card || card.open || card.removed) return;

    card.open = true;
    room.openCards.push(index);

    if (room.openCards.length === 2) {
      const [a, b] = room.openCards;
      const c1 = room.cards[a];
      const c2 = room.cards[b];

      if (c1.value === c2.value) {
        c1.removed = c2.removed = true;
        room.combo++;
        room.players[room.currentPlayer].score += room.combo;
        room.openCards = [];
      } else {
        room.combo = 0;
        setTimeout(() => {
          c1.open = c2.open = false;
          room.openCards = [];
          room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
          if (room.currentPlayer === 0) room.turn++;
          io.to(roomId).emit('update', room);
        }, 800);
      }
    }

    io.to(roomId).emit('update', room);

    if (room.cards.every(c => c.removed)) {
      room.started = false;
      io.emit('ranking', room.players.map(p => ({
        name: p.name,
        score: p.score,
        turn: room.turn
      })));
    }
  });

  socket.on('disconnect', () => {
    for (const room of Object.values(rooms)) {
      room.players = room.players.filter(p => p.id !== socket.id);
    }
    io.emit('roomList', getRoomList());
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  if (!room || room.started) return;

  room.started = true;
  room.cards = createDeck(room.mode);
  room.turn = 1;
  room.currentPlayer = 0;
  room.combo = 0;

  io.to(roomId).emit('gameStarted', room);
}

server.listen(PORT, () => console.log('서버 실행', PORT));