const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 部屋一覧とメッセージ履歴を保存
let rooms = {}; // { roomName: { users: [], messages: [] } }

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ====== ページ ======
// ログインページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// 部屋一覧
app.get("/rooms", (req, res) => {
  res.sendFile(path.join(__dirname, "public/room.html"));
});

// チャットページ
app.get("/chat/:room", (req, res) => {
  res.sendFile(path.join(__dirname, "public/chat.html"));
});

// ====== 部屋管理API ======
// 部屋一覧を返す
app.get("/api/rooms", (req, res) => {
  res.json(Object.keys(rooms));
});

// 部屋を作成
app.post("/create-room", (req, res) => {
  const roomName = req.body.roomName?.trim();
  if (roomName && !rooms[roomName]) {
    rooms[roomName] = { users: [], messages: [] };
  }
  res.redirect("/rooms"); // ここで再読み込みして部屋一覧に反映
});

// ====== Socket.io ======
io.on("connection", (socket) => {
  console.log("✅ ユーザー接続:", socket.id);

  let currentRoom = null;
  let currentUser = "ゲスト";

  // ユーザー名を設定
  socket.on("setUsername", (username) => {
    currentUser = username || "ゲスト";
  });

  // 部屋に参加
  socket.on("joinRoom", (roomName) => {
    if (!rooms[roomName]) {
      rooms[roomName] = { users: [], messages: [] }; // なければ新規作成
    }

    currentRoom = roomName;
    socket.join(roomName);
    rooms[roomName].users.push(currentUser);

    // 過去ログを送信
    socket.emit("chatHistory", rooms[roomName].messages);

    // 入室通知
    io.to(roomName).emit(
      "chat message",
      { user: "システム", text: `${currentUser} が入室しました` }
    );
  });

  // メッセージ送信
  socket.on("chat message", (msg) => {
    if (currentRoom && rooms[currentRoom]) {
      const messageData = { user: currentUser, text: msg };
      rooms[currentRoom].messages.push(messageData);

      io.to(currentRoom).emit("chat message", messageData);
    }
  });

  // 切断処理
  socket.on("disconnect", () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].users = rooms[currentRoom].users.filter(
        (u) => u !== currentUser
      );
      io.to(currentRoom).emit(
        "chat message",
        { user: "システム", text: `${currentUser} が退室しました` }
      );
    }
    console.log("❌ ユーザー切断:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 サーバー起動中: http://localhost:${PORT}`);
});
