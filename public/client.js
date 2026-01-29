const socket = io();

let currentRoom = null;

const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const board = document.getElementById('board');
const playersDiv = document.getElementById('players');
const roomTitle = document.getElementById('roomTitle');
const startBtn = document.getElementById('startBtn');
const turnInfo = document.getElementById('turnInfo');
const currentPlayerDiv = document.getElementById('currentPlayer');

socket.on('roomList', rooms => {
  console.log('🔥 roomList raw data:', rooms);

  const list = document.getElementById('roomList');
  list.innerHTML = '';

  rooms.forEach(r => {
    console.log('👉 room item:', r);
    
    const count = Array.isArray(r.players)
      ? r.players.length
      : r.players;
    
    const li = document.createElement('li');
    li.textContent =
      `${r.title} (${count}/${r.maxPlayers}) - ${r.status}`;
    li.onclick = () => joinRoom(r.id);
    list.appendChild(li);
  });
});

function createRoom() {
  socket.emit('createRoom', {
    nickname: nickname.value,
    title: title.value,
    maxPlayers: +maxPlayers.value,
    mode: mode.value
  });
}

function joinRoom(id) {
  if (!nickname.value.trim()) {
    alert('닉네임을 입력하세요');
    return;
  }
  socket.emit('joinRoom', {
    roomId: id,
    nickname: nickname.value
  });
}

socket.on('joinedRoom', room => {
  console.log('✅ joinedRoom:', room.id);
  currentRoom = room;
  showGame(room);
});

socket.on('updateRoom', room => {
  currentRoom = room;
  renderPlayers(room.players);
});

function startGame() {
  socket.emit('startGame', currentRoom.id);
}

socket.on('gameStarted', room => {
  console.log('🎴 cards:', room.cards);
  currentRoom = room;
  showGame(room);
  renderCards(room.cards);
});

socket.on('cardUpdate', cards => renderCards(cards));

function showGame(room) {
  lobby.style.display = 'none';
  game.style.display = 'block';
  roomTitle.textContent = room.title;
  startBtn.style.display =
    room.hostId === socket.id && room.status === 'waiting'
      ? 'block' : 'none';
  renderPlayers(room.players);
}

function renderPlayers(players) {
  playersDiv.innerHTML = '';

  players.forEach((p, idx) => {
    const div = document.createElement('div');

    div.textContent = `${p.nickname} : ${p.score}점`;

    // ⭐ 현재 차례 강조
    if (idx === currentRoom.turnIndex) {
      div.classList.add('active-player');
      currentPlayerDiv.textContent = `현재 차례: ${p.nickname}`;
    }

    playersDiv.appendChild(div);
  });

  // TURN 표시
  turnInfo.textContent = `TURN ${room.turnCount}`;
}

function renderCards(cards) {
  board.innerHTML = '';
  cards.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.textContent = c.open ? c.value : '';
    if (c.removed) div.classList.add('removed');
    div.onclick = () => socket.emit('flipCard', {
      roomId: currentRoom.id,
      index: i
    });
    board.appendChild(div);
  });
}
