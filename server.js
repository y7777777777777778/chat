const express = require("express");
const http = require("http");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// SQLite データベース
const db = new sqlite3.Database("./chatapp.db");

// テーブル作成
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT,
    username TEXT,
    message TEXT,
    image TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`);
});

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// ユーザー登録
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    function (err) {
      if (err) {
        return res.json({ success: false, message: "登録失敗: " + err.message });
      }
      res.json({ success: true, message: "登録成功" });
    }
  );
});

// ログイン
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (err) {
        return res.json({ success: false, message: "サーバーエラー" });
      }
      if (row) {
        res.json({ success: true, username: row.username });
      } else {
        res.json({ success: false, message: "ユーザー名またはパスワードが違います" });
      }
    }
  );
});

// 部屋一覧
app.get("/rooms", (req, res) => {
  db.all("SELECT * FROM rooms", [], (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

// 部屋作成
app.post("/rooms", (req, res) => {
  const { roomName } = req.body;
  db.run("INSERT INTO rooms (name) VALUES (?)", [roomName], function (err) {
    if (err) {
      return res.json({ success: false, message: "部屋作成失敗: " + err.message });
    }
    res.json({ success: true, id: this.lastID, name: roomName });
  });
});

// 過去ログ取得
app.get("/messages/:room", (req, res) => {
  const room = req.params.room;
  db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC", [room], (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

// --- Socket.io ---
io.on("connection", (socket) => {
  socket.on("joinRoom", (room, username) => {
    socket.join(room);
    socket.to(room).emit("chat message", { username: "system", message: `${username}が参加しました` });
  });

  socket.on("chat message", ({ room, username, message, image }) => {
    db.run(
      "INSERT INTO messages (room, username, message, image) VALUES (?, ?, ?, ?)",
      [room, username, message, image || null]
    );
    io.to(room).emit("chat message", { username, message, image });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバー起動 http://localhost:${PORT}`);
});
