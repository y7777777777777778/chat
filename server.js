const express = require("express");
const http = require("http");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== SQLite 設定 =====
const db = new sqlite3.Database("./chat.db");

// ユーザーテーブル
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)`);

// メッセージテーブル
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT,
  username TEXT,
  message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ===== ミドルウェア =====
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "chat-secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ===== ページルーティング =====
app.get("/", (req, res) => {
  if (!req.session.username) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  res.redirect("/rooms");
});

app.get("/rooms", (req, res) => {
  if (!req.session.username) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

app.get("/chat/:room", (req, res) => {
  if (!req.session.username) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// ===== 認証 API =====
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    (err) => {
      if (err) {
        return res.send("登録失敗: ユーザー名は既に存在します");
      }
      res.redirect("/");
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (row) {
        req.session.username = username;
        res.redirect("/rooms");
      } else {
        res.send("ログイン失敗: ユーザー名またはパスワードが違います");
      }
    }
  );
});

// ===== WebSocket (Socket.IO) =====
io.on("connection", (socket) => {
  console.log("ユーザー接続");

  // 部屋参加
  socket.on("joinRoom", ({ room, username }) => {
    socket.join(room);

    // 過去ログ送信
    db.all(
      "SELECT username, message, timestamp FROM messages WHERE room = ? ORDER BY id ASC",
      [room],
      (err, rows) => {
        if (!err) {
          socket.emit("chatHistory", rows);
        }
      }
    );

    socket.to(room).emit("message", {
      username: "システム",
      message: `${username}さんが参加しました`,
      timestamp: new Date(),
    });
  });

  // メッセージ送信
  socket.on("chatMessage", ({ room, username, message }) => {
    db.run("INSERT INTO messages (room, username, message) VALUES (?, ?, ?)", [
      room,
      username,
      message,
    ]);

    io.to(room).emit("message", {
      username,
      message,
      timestamp: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log("ユーザー切断");
  });
});

// ===== サーバー起動 =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
