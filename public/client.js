// =============================
// Socket 연결
// =============================
const socket = io();

// =============================
// DOM
// =============================
const main = document.getElementById('main');
const game = document.getElementById('game');
const roomListEl = document.getElementById('roomList');
const playersEl = document.getElementById('players');
const boardEl = document.getElementById('board');
const titleEl = document.getElementById('roomTitle');
const turnEl = document.getElementById('turnInfo');
const startBtn = document.getElementById('startBtn');

// =============================
// 상태
// =============================
let nickname = localStorage.getItem('nickname');
let roomId = null;
let myId = null;
let currentRoom = null;

// =============================
// 닉네임
// =============================
function saveNickname() {
  const v = document.getElementById('nickname').value;
  if (!v) return alert('닉네임 입력');
  nickname = v;
  localStorage.setItem('nickname', v);
}

// =============================
// 방 만들기
// =============================
function createRoom() {
  if (!nickname) return alert('닉네임 먼저');
  socket.emit('createRoom', {
    nickname,
    title: '메모리 게임',
    maxPlayers: 4,
    mode: 'number'
  });
}

// =============================
// 게임 시작 (방장)
// =============================
function startGame() {
  if (!roomId) return;
  socket.emit('startGame', { roomId });
}

// =============================
// 방 목록 렌더
// =============================
socket.on('roomList', rooms => {
  roomListEl.innerHTML = '';
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.title} (${r.players}/${r.max}) - ${r.status}`;
    li.onclick = () => {
      socket.emit('joinRoom', { roomId: r.id, nickname });
    };
    roomListEl.appendChild(li);
  });
});

// =============================
// 방 입장 완료
// =============================
socket.on('joinedRoom', room => {
  roomId = room.id;
  currentRoom = room;

  main.classList.remove('active');
  game.classList.add('active');

  render(room);
});

// =============================
// 게임 상태 업데이트
// =============================
socket.on('update', room => {
  currentRoom = room;
  render(room);
});

// =============================
// 렌더링
// =============================
function render(room) {
  titleEl.textContent = room.title;

  // 플레이어 목록
  playersEl.innerHTML = room.players
    .map((p, i) =>
      `${i === room.currentPlayer ? '👉' : ''}${p.name}: ${p.score}`
    )
    .join('<br>');

  turnEl.textContent = `턴: ${room.turn}`;

  // 방장만 시작 버튼
  startBtn.style.display =
    socket.id === room.host && !room.started ? 'block' : 'none';

  // 카드 보드
  boardEl.innerHTML = '';
  room.cards.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'card';

    if (c.removed) {
      div.classList.add('removed');
    } else if (c.open) {
      div.textContent = c.value;
    } else {
      div.textContent = '?';
    }

    // PC 클릭 + 모바일 터치 대응
    div.addEventListener('click', () => flip(i));
    div.addEventListener('touchstart', e => {
      e.preventDefault();
      flip(i);
    });

    boardEl.appendChild(div);
  });
}

// =============================
// 카드 뒤집기
// =============================
function flip(index) {
  if (!currentRoom?.started) return;
  socket.emit('flipCard', { roomId, index });
}
