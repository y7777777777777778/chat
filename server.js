const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// publicフォルダを静的ファイルとして配信
app.use(express.static(path.join(__dirname, "public")));

// クライアントとのSocket.IO通信
io.on("connection", (socket) => {
  console.log("🔌 ユーザー接続:", socket.id);

  // 部屋に参加
  socket.on("joinRoom", ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;

    // 参加メッセージ
    socket.to(room).emit("chatMessage", {
      username: "system",
      message: `${username} さんが入室しました。`
    });
  });

  // メッセージ送信
  socket.on("chatMessage", (msg) => {
    if (socket.room) {
      io.to(socket.room).emit("chatMessage", {
        username: socket.username,
        message: msg
      });
    }
  });

  // 切断
  socket.on("disconnect", () => {
    if (socket.room) {
      io.to(socket.room).emit("chatMessage", {
        username: "system",
        message: `${socket.username || "不明なユーザー"} さんが退室しました。`
      });
    }
    console.log("❌ ユーザー切断:", socket.id);
  });
});

// Render用ポート
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
