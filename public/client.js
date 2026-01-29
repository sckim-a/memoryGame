const socket = io();

const main = document.getElementById('main');
const game = document.getElementById('game');
const roomList = document.getElementById('roomList');
const board = document.getElementById('board');
const playersDiv = document.getElementById('players');

let nickname = '';
let currentRoom = null;
let locked = false;

// 화면 전환
function showMain() {
  main.classList.add('active');
  game.classList.remove('active');
}

function showGame() {
  main.classList.remove('active');
  game.classList.add('active');
}

// 닉네임 저장
function saveNickname() {
  nickname = nicknameInput.value;
}

// 방 생성
function createRoom() {
  socket.emit('createRoom', {
    nickname,
    title: roomTitle.value,
    maxPlayers: maxPlayers.value,
    mode: gameMode.value
  });
}

// 방 입장
function joinRoom(id) {
  socket.emit('joinRoom', { roomId: id, nickname });
  showGame();
}

// 게임 시작
function startGame() {
  socket.emit('startGame', currentRoom.id);
}

// 나가기
function leaveRoom() {
  location.reload();
}

// 카드 클릭 (모바일 대응)
function flip(index) {
  if (locked) return;
  socket.emit('flipCard', {
    roomId: currentRoom.id,
    index
  });
}

// 방 목록 갱신
socket.on('roomList', rooms => {
  roomList.innerHTML = '';
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.title} (${r.players.length}/${r.maxPlayers})`;
    li.onclick = () => joinRoom(r.id);
    roomList.appendChild(li);
  });
});

// 방 상태 업데이트
socket.on('roomUpdate', room => {
  currentRoom = room;

  playersDiv.innerHTML = room.players
    .map(p => `${p.nickname} (${p.score})`)
    .join('<br>');

  renderBoard();
});

// 게임 시작
socket.on('gameStarted', room => {
  currentRoom = room;
  renderBoard();
});

// 카드 렌더링
function renderBoard(room) {
  board.innerHTML = '';

  room.cards.forEach((card, index) => {
    const div = document.createElement('div');
    div.className = 'card';

    if (card.open || card.removed) {
      div.textContent = card.value;
    }

    // 🔥 모바일 대응 이벤트
    div.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      flip(index);
    });

    board.appendChild(div);
  });
}

socket.on('updateBoard', room => {
    renderBoard(room);
  
    // 2장 열려있으면 잠금
    locked = room.openCards.length === 2;
});

/*
function renderBoard() {
  board.innerHTML = '';

  if (!currentRoom.started) {
    board.innerHTML = '<p>게임 대기중...</p>';
    return;
  }

  currentRoom.cards.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'card';

    if (card.open) {
      div.classList.add('open');
      div.textContent = card.value;
    }

    div.onclick = () => flip(i);
    div.ontouchstart = () => flip(i);

    board.appendChild(div);
  });

  function onCardClick(index) {
    if (locked) return;
    socket.emit('flipCard', { roomId, index });
  }
    
  socket.on('updateBoard', room => {
    renderBoard(room);
  
    // 2장 열려있으면 잠금
    locked = room.openCards.length === 2;
  });
}*/
