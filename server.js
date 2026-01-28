// =============================
// server.js (메모리 게임 서버)
// =============================
// - Express로 클라이언트(static) 제공
// - Socket.IO로 실시간 멀티플레이
// - 방 생성 / 입장 / 시작 / 카드 뒤집기 처리

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 🔹 public 폴더를 클라이언트로 서빙
app.use(express.static('public'));

// 🔹 Socket.IO 설정 (같은 origin이라 CORS 문제 없음)
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// =============================
// 게임 상태 (메모리)
// =============================
const rooms = {};

// 카드 덱 생성 (24쌍 = 48장)
function createDeck() {
  const values = [];
  for (let i = 1; i <= 24; i++) values.push(i, i);
  return values
    .sort(() => Math.random() - 0.5)
    .map(v => ({ value: v, open: false, removed: false }));
}

// 방 목록 (로비용)
function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    title: r.title,
    players: r.players.length,
    max: r.maxPlayers,
    status: r.started ? '진행중' : '대기중'
  }));
}

// =============================
// Socket.IO 이벤트
// =============================
io.on('connection', socket => {
  console.log('접속:', socket.id);

  // 접속 시 방 목록 전송
  socket.emit('roomList', getRoomList());

  // 방 목록 요청
  socket.on('requestRoomList', () => {
    socket.emit('roomList', getRoomList());
  });

  // -----------------------------
  // 방 생성 (방장은 자동 입장)
  // -----------------------------
  socket.on('createRoom', ({ nickname, title, maxPlayers, mode }) => {
    const id = Math.random().toString(36).substring(2, 6);

    const room = {
      id,
      title: title || '메모리 게임',
      mode: mode || 'number',
      maxPlayers: maxPlayers || 4,
      host: socket.id,
      started: false,
      turn: 1,
      currentPlayer: 0,
      combo: 0,
      openCards: [],
      cards: [],
      players: []
    };

    rooms[id] = room;

    // ⭐ 방장 자동 입장
    socket.join(id);
    room.players.push({
      id: socket.id,
      name: nickname,
      score: 0
    });

    // 방장에게 입장 완료 알림 (화면 전환 트리거)
    socket.emit('joinedRoom', room);
    io.emit('roomList', getRoomList());
  });

  // -----------------------------
  // 방 입장
  // -----------------------------
  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length >= room.maxPlayers) return;

    socket.join(roomId);
    room.players.push({ id: socket.id, name: nickname, score: 0 });

    socket.emit('joinedRoom', room);
    io.to(roomId).emit('update', room);
    io.emit('roomList', getRoomList());

    // 인원 다 차면 자동 시작
    if (room.players.length === room.maxPlayers) startGame(roomId);
  });

  // -----------------------------
  // 게임 시작 (방장만 가능)
  // -----------------------------
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.host) return; // 방장 체크
    startGame(roomId);
  });

  // -----------------------------
  // 카드 뒤집기
  // -----------------------------
  socket.on('flipCard', ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const card = room.cards[index];
    if (!card || card.open || card.removed) return;

    card.open = true;
    room.openCards.push(index);

    // 카드 2장 뒤집었을 때
    if (room.openCards.length === 2) {
      const [a, b] = room.openCards;
      const c1 = room.cards[a];
      const c2 = room.cards[b];

      if (c1.value === c2.value) {
        // 같은 그림
        c1.removed = c2.removed = true;
        room.combo++;
        room.players[room.currentPlayer].score += room.combo;
        room.openCards = [];
      } else {
        // 다른 그림
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
  });

  // -----------------------------
  // 접속 종료 처리
  // -----------------------------
  socket.on('disconnect', () => {
    for (const room of Object.values(rooms)) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);

        // 방장 나가면 방 삭제
        if (room.host === socket.id || room.players.length === 0) {
          delete rooms[room.id];
        }
      }
    }
    io.emit('roomList', getRoomList());
  });
});

// =============================
// 게임 시작 공통 함수
// =============================
function startGame(roomId) {
  const room = rooms[roomId];
  if (!room || room.started) return;

  room.started = true;
  room.cards = createDeck();
  room.turn = 1;
  room.currentPlayer = 0;
  room.combo = 0;
  room.openCards = [];

  io.to(roomId).emit('update', room);
}

server.listen(PORT, () => {
  console.log('서버 실행:', PORT);
});
