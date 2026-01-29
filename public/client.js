const socket = io();

let currentRoom = null;

const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const board = document.getElementById('board');
const playersDiv = document.getElementById('players');
const roomTitle = document.getElementById('roomTitle');
const startBtn = document.getElementById('startBtn');

socket.on('roomList', rooms => {
  const list = document.getElementById('roomList');
  list.innerHTML = '';
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.title} (${r.players}/${r.maxPlayers}) - ${r.status}`;
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
  playersDiv.innerHTML = players.map(p =>
    `${p.nickname}: ${p.score}`
  ).join('<br>');
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
