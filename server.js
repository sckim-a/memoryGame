// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ======================
// 게임 상태 저장
// ======================
const rooms = {};

function createDeck() {
  const values = [];
  for (let i = 1; i <= 24; i++) {
    values.push(i, i);
  }
  return values
    .sort(() => Math.random() - 0.5)
    .map(v => ({ value: v, open: false, removed: false }));
}

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    players: r.players.length,
    max: r.maxPlayers,
    status: r.started ? '진행중' : '대기중'
  }));
}

// ======================
// 소켓 처리
// ======================
io.on('connection', (socket) => {
  console.log('접속:', socket.id);

  socket.emit('roomList', getRoomList());

  socket.on('requestRoomList', () => {
    socket.emit('roomList', getRoomList());
  });

  socket.on('createRoom', ({ nickname, maxPlayers = 5 }) => {
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

    console.log('방 생성:', id);
    socket.emit('roomCreated', rooms[id]);
    io.emit('roomList', getRoomList());
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.players.length >= room.maxPlayers) return;

    socket.join(roomId);
    room.players.push({
      id: socket.id,
      name: nickname,
      score: 0
    });

    socket.emit('joinedRoom', room);
    io.to(roomId).emit('updateBoard', room);
    io.emit('roomList', getRoomList());

    // 인원 다 차면 자동 시작
    if (room.players.length === room.maxPlayers) {
      startGame(roomId);
    }
  });

  socket.on('startGame', ({ roomId }) => {
    startGame(roomId);
  });

  socket.on('flipCard', ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || room.started === false) return;

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
        const player = room.players[room.currentPlayer];
        player.score += room.combo; // 콤보 점수
        room.openCards = [];
      } else {
        room.combo = 0;
        setTimeout(() => {
          c1.open = c2.open = false;
          room.openCards = [];
          room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
          if (room.currentPlayer === 0) room.turn++;
          io.to(roomId).emit('updateBoard', room);
        }, 800);
      }
    }

    io.to(roomId).emit('updateBoard', room);

    // 게임 종료 체크
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
    console.log('종료:', socket.id);
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
  room.cards = createDeck();
  room.turn = 1;
  room.currentPlayer = 0;
  room.combo = 0;

  io.to(roomId).emit('gameStarted', {
    cards: room.cards
  });

  io.to(roomId).emit('updateBoard', room);
}

server.listen(PORT, () => {
  console.log('서버 실행:', PORT);

});
