const express = require("express");
const http = require("http");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// SQLite DB 設定
const db = new sqlite3.Database("./chat.db");

// テーブル作成
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT, username TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)"
  );
});

// ======================== ユーザー認証 API ========================

// 新規登録
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "必要事項を入力してください" });

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    function (err) {
      if (err) return res.status(400).json({ success: false, message: "ユーザー名は既に存在します" });
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
      if (err) return res.status(500).json({ success: false, message: "データベースエラー" });
      if (!row) return res.status(401).json({ success: false, message: "ユーザー名またはパスワードが違います" });

      res.json({ success: true, username: row.username });
    }
  );
});

// ======================== 部屋管理 ========================
let rooms = {}; // { roomName: [socketId, ...] }

// 部屋一覧を返す API
app.get("/rooms", (req, res) => {
  res.json(Object.keys(rooms));
});

// ======================== Socket.io ========================
io.on("connection", (socket) => {
  console.log("✅ ユーザー接続:", socket.id);

  socket.on("joinRoom", (room, username) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(socket.id);

    // 過去ログを送信
    db.all("SELECT username, message, timestamp FROM messages WHERE room = ? ORDER BY id ASC", [room], (err, rows) => {
      if (!err) {
        socket.emit("loadMessages", rows);
      }
    });

    io.to(room).emit("systemMessage", `${username} が入室しました`);
  });

  socket.on("chatMessage", ({ room, username, message }) => {
    db.run("INSERT INTO messages (room, username, message) VALUES (?, ?, ?)", [room, username, message]);
    io.to(room).emit("chatMessage", { username, message, timestamp: new Date() });
  });

  socket.on("disconnect", () => {
    for (const room in rooms) {
      rooms[room] = rooms[room].filter((id) => id !== socket.id);
      if (rooms[room].length === 0) delete rooms[room];
    }
    console.log("❌ ユーザー切断:", socket.id);
  });
});

// ======================== サーバー起動 ========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
