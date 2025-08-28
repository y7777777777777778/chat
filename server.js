const express = require("express");
const http = require("http");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== SQLite データベース設定 =====
const db = new sqlite3.Database("./chat.db");

// ユーザーテーブルとメッセージテーブル作成
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
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ===== セッション設定 =====
app.use(session({
  secret: "secret-key",
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ===== ルーティング =====

// ルートはログインページへ
app.get("/", (req, res) => {
  if (req.session.user) {
    res.redirect("/rooms.html");
  } else {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// 新規登録
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function (err) {
    if (err) {
      return res.send("登録エラー: 既に使われています");
    }
    res.redirect("/");
  });
});

// ログイン
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (row) {
      req.session.user = row.username;
      res.redirect("/rooms.html");
    } else {
      res.send("ログイン失敗: ユーザー名またはパスワードが違います");
    }
  });
});

// ログアウト
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ===== Socket.IO チャット処理 =====
io.on("connection", (socket) => {
  let currentRoom = null;
  let username = null;

  // ログインユーザー名を受け取る
  socket.on("setUser", (name) => {
    username = name;
  });

  // 部屋に参加
  socket.on("joinRoom", (room) => {
    if (currentRoom) {
      socket.leave(currentRoom);
    }
    currentRoom = room;
    socket.join(room);

    // 過去ログ送信
    db.all("SELECT username, message, timestamp FROM messages WHERE room = ? ORDER BY id ASC", [room], (err, rows) => {
      socket.emit("chatHistory", rows);
    });

    io.to(room).emit("systemMessage", `${username}さんが入室しました`);
  });

  // メッセージ送信
  socket.on("chatMessage", (msg) => {
    if (!currentRoom || !username) return;

    // DBに保存
    db.run("INSERT INTO messages (room, username, message) VALUES (?, ?, ?)", [currentRoom, username, msg]);

    io.to(currentRoom).emit("chatMessage", {
      username: username,
      message: msg,
      timestamp: new Date().toLocaleString()
    });
  });

  // 退出処理
  socket.on("disconnect", () => {
    if (currentRoom && username) {
      io.to(currentRoom).emit("systemMessage", `${username}さんが退室しました`);
    }
  });
});

// ===== サーバー起動 =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
