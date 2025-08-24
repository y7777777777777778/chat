const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get("user");

let currentRoom = "";

const roomsUl = document.getElementById("rooms");
const messagesUl = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const fileInput = document.getElementById("fileInput");
const roomNameH3 = document.getElementById("roomName");
const newRoomInput = document.getElementById("newRoom");
const createRoomBtn = document.getElementById("createRoom");

function joinRoom(room) {
  if (currentRoom) socket.emit("leaveRoom", currentRoom);
  currentRoom = room;
  roomNameH3.textContent = room;
  socket.emit("joinRoom", { username, room });
  messagesUl.innerHTML = "";
}

// メッセージ送信
form.addEventListener("submit", e => {
  e.preventDefault();
  if (input.value) socket.emit("chatMessage", input.value);
  if (fileInput.files[0]) {
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("username", username);
    formData.append("room", currentRoom);
    fetch("/upload", { method:"POST", body: formData });
    fileInput.value = "";
  }
  input.value = "";
});

// Socketイベント
socket.on("chatMessage", msg => {
  const li = document.createElement("li");
  li.textContent = `${msg.username}: ${msg.text}`;
  messagesUl.appendChild(li);
});

socket.on("fileMessage", data => {
  const li = document.createElement("li");
  if (data.type.startsWith("image/")) {
    li.innerHTML = `${data.username}:<br><img src="/uploads/${currentRoom}/${data.filename}" style="max-width:200px;">`;
  } else {
    li.textContent = `${data.username}: 【ファイル送信】`;
  }
  messagesUl.appendChild(li);
});

socket.on("roomUpdate", list => {
  roomsUl.innerHTML = "";
  list.forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.name} (${r.count})`;
    li.style.cursor = "pointer";
    li.onclick = () => joinRoom(r.name);
    roomsUl.appendChild(li);
  });
});

// 新規部屋作成
createRoomBtn.onclick = () => {
  const r = newRoomInput.value.trim();
  if (r) joinRoom(r);
};
