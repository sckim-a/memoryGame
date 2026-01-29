const socket = io();

const main = document.getElementById('main');
const game = document.getElementById('game');
const board = document.getElementById('board');
const roomList = document.getElementById('roomList');
const playersDiv = document.getElementById('players');
const turnDiv = document.getElementById('turn');
const startBtn = document.getElementById('startBtn');
const nicknameInput = document.getElementById('nickname');
const roomTitleInput = document.getElementById('roomTitle');
const maxPlayersSelect = document.getElementById('maxPlayers');
const modeSelect = document.getElementById('mode');

let nickname = '';
let currentRoom = null;
let locked = false;

function showMain() {
  main.classList.add('active');
  game.classList.remove('active');
}

function showGame() {
  main.classList.remove('active');
  game.classList.add('active');
}

function createRoom() {
  nickname = nicknameInput.value.trim();
  if (!nickname) {
    alert('닉네임을 입력하세요');
    return;
  }
  socket.emit('createRoom', {
    nickname,
    title: roomTitleInput.value || '메모리 게임',
    maxPlayers: Number(maxPlayersSelect.value),
    mode: modeSelect.value
  });
}

function startGame() {
  socket.emit('startGame', currentRoom.id);
}

function flip(index) {
  if (locked) return;
  socket.emit('flipCard', { roomId: currentRoom.id, index });
}

socket.on('roomList', rooms => {
  roomList.innerHTML = '';
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.title} (${r.players?.length || 0}/${r.maxPlayers})`;
    li.onclick = () => {
      nickname = nicknameInput.value;
      socket.emit('joinRoom', { roomId: r.id, nickname });
    };
    roomList.appendChild(li);
  });
});

socket.on('joinedRoom', room => {
  currentRoom = room;
  showGame();
});

socket.on('roomUpdate', room => {
  currentRoom = room;
  locked = room.openCards.length === 2;

  turnDiv.textContent = `턴 ${room.turn} - ${room.players[room.currentPlayer].name}`;
  startBtn.style.display =
    room.host === socket.id && !room.started ? 'block' : 'none';

  playersDiv.innerHTML = room.players
    .map(p => `${p.name}: ${p.score}`)
    .join(' | ');

  board.innerHTML = '';
  room.cards.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'card';

    if (!card.open && !card.removed) {
      div.classList.add('back');
    } else {
      div.textContent = card.value;
    }

    div.addEventListener('pointerdown', e => {
      e.preventDefault();
      flip(i);
    });

    board.appendChild(div);
  });
});
