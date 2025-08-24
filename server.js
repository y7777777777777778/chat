const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ファイル保存設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const room = req.body.room;
    const dir = path.join(__dirname, "uploads", room);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  },
});
const upload = multer({ storage });

// ---- データ管理 ----
let users = {}; // { username: password }
let rooms = {}; // { roomName: { users: [], messages: [], files: [], lastActive, warned, dailyCount } }
let archive = {}; // { roomName: [messages] }

// ---- ログイン・登録 ----
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ ok: false, msg: "必須項目" });
  if (users[username]) return res.json({ ok: false, msg: "既に存在" });
  users[username] = password;
  return res.json({ ok: true });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) return res.json({ ok: true });
  return res.json({ ok: false, msg: "認証失敗" });
});

// ---- ファイルアップロード ----
app.post("/upload", upload.single("file"), (req, res) => {
  const { username, room } = req.body;
  if (!rooms[room]) rooms[room] = { users: [], messages: [], files: [], lastActive: Date.now(), warned: false, dailyCount: {} };
  let roomData = rooms[room];

  // 日別制限
  const today = new Date().toDateString();
  if (!roomData.dailyCount[username]) roomData.dailyCount[username] = { date: today, count: 0 };
  if (roomData.dailyCount[username].date !== today) roomData.dailyCount[username] = { date: today, count: 0 };
  if (roomData.dailyCount[username].count >= 10) return res.json({ ok: false, msg: "1日10回上限" });

  roomData.dailyCount[username].count++;

  // ファイル履歴追加
  roomData.files.push({ filename: req.file.filename, original: req.file.originalname, user: username, time: Date.now(), type: req.file.mimetype });

  // 100件以上は古いファイル削除
  while (roomData.files.length > 100) {
    const old = roomData.files.shift();
    fs.unlinkSync(path.join(__dirname, "uploads", room, old.filename));
  }

  // ファイル送信で延長
  roomData.lastActive = Date.now();

  io.to(room).emit("fileMessage", { username, original: req.file.originalname, type: req.file.mimetype });
  res.json({ ok: true });
});

// ---- Socket.IO ----
io.on("connection", socket => {
  socket.on("joinRoom", ({ username, room }) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = { users: [], messages: [], files: [], lastActive: Date.now(), warned: false, dailyCount: {} };
    rooms[room].users.push(username);

    socket.emit("roomData", rooms[room]);
    io.emit("roomUpdate", getRoomList());

    socket.on("chatMessage", msg => {
      const message = { username, text: msg, time: Date.now() };
      rooms[room].messages.push(message);
      io.to(room).emit("chatMessage", message);

      // メッセージ送信で延長
      rooms[room].lastActive = Date.now();
    });

    socket.on("disconnect", () => {
      if (rooms[room]) {
        rooms[room].users = rooms[room].users.filter(u => u !== username);
        io.emit("roomUpdate", getRoomList());
      }
    });
  });
});

// ---- 部屋一覧取得 ----
function getRoomList() {
  return Object.entries(rooms).map(([name, data]) => ({ name, count: data.users.length }));
}

// ---- 過去メッセージアーカイブ ----
function archiveRoom(roomName) {
  if (!rooms[roomName]) return;
  archive[roomName] = rooms[roomName].messages;
  rooms[roomName].files.forEach(f => fs.unlinkSync(path.join(__dirname, "uploads", roomName, f.filename)));
  delete rooms[roomName];
}

// ---- 部屋削除チェック（定期） ----
setInterval(() => {
  const now = Date.now();
  for (const [roomName, room] of Object.entries(rooms)) {
    const inactive = now - room.lastActive;

    // 警告 5日経過
    if (!room.warned && inactive > 5 * 24 * 60 * 60 * 1000) {
      room.warned = true;
      io.to(roomName).emit("systemMessage", "⚠️ この部屋は2日後に削除されます。メッセージ送信で延長できます。");
    }

    // 削除 7日経過
    if (inactive > 7 * 24 * 60 * 60 * 1000) {
      archiveRoom(roomName);
    }
  }
}, 60 * 60 * 1000); // 1時間ごと

// ---- 過去メッセージ取得 ----
app.get("/archive/:room", (req, res) => {
  const room = req.params.room;
  res.json(archive[room] || []);
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
