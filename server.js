const express = require("express");
const http = require("http");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- SQLite データベース ---
const db = new sqlite3.Database("./chat.db");

// ユーザーテーブル
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

// 部屋テーブル
db.run(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )
`);

// メッセージテーブル
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT,
    username TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- API ---
// 新規登録
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    (err) => {
      if (err) {
        return res.json({ success: false, message: "ユーザー名は既に存在します" });
      }
      res.json({ success: true });
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
      if (row) {
        res.json({ success: true, username: row.username });
      } else {
        res.json({ success: false, message: "ログイン失敗" });
      }
    }
  );
});

// 部屋一覧取得
app.get("/rooms", (req, res) => {
  db.all("SELECT name FROM rooms", [], (err, rows) => {
    res.json(rows.map((r) => r.name));
  });
});

// 新しい部屋を作成
app.post("/rooms", (req, res) => {
  const { name } = req.body;
  db.run("INSERT OR IGNORE INTO rooms (name) VALUES (?)", [name], (err) => {
    if (err) {
      return res.json({ success: false });
    }
    res.json({ success: true });
  });
});

// 部屋の過去ログ取得
app.get("/messages/:room", (req, res) => {
  const room = req.params.room;
  db.all(
    "SELECT username, message, timestamp FROM messages WHERE room = ? ORDER BY id ASC",
    [room],
    (err, rows) => {
      res.json(rows);
    }
  );
});

// --- Socket.IO ---
io.on("connection", (socket) => {
  console.log("ユーザー接続");

  socket.on("joinRoom", (room, username) => {
    socket.join(room);
    socket.room = room;
    socket.username = username;

    io.to(room).emit("chat message", {
      username: "system",
      message: `${username} が入室しました`,
      timestamp: new Date().toLocaleString(),
    });
  });

  socket.on("chat message", (msg) => {
    if (!socket.room || !socket.username) return;
    const data = {
      username: socket.username,
      message: msg,
      timestamp: new Date().toLocaleString(),
    };

    // DBに保存
    db.run(
      "INSERT INTO messages (room, username, message) VALUES (?, ?, ?)",
      [socket.room, socket.username, msg]
    );

    io.to(socket.room).emit("chat message", data);
  });

  socket.on("disconnect", () => {
    if (socket.room && socket.username) {
      io.to(socket.room).emit("chat message", {
        username: "system",
        message: `${socket.username} が退出しました`,
        timestamp: new Date().toLocaleString(),
      });
    }
  });
});

// --- サーバー起動 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});
