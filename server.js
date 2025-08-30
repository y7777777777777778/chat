const express = require("express");
const http = require("http");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// body-parser 相当
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SQLite DB
const db = new sqlite3.Database("./chat.db");

// ユーザーテーブルがなければ作成
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)`);

// 静的ファイル
app.use(express.static(path.join(__dirname, "public")));

// 登録
app.post("/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send("ユーザー名とパスワードを入力してください");
    }

    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function(err) {
        if (err) {
            return res.status(400).send("既に使われている名前です");
        }
        res.redirect("/"); // 登録成功 → ログイン画面に戻す
    });
});

// ログイン
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (err) return res.status(500).send("エラー");
        if (!row) return res.status(401).send("ユーザー名またはパスワードが違います");
        res.redirect(`/rooms?username=${encodeURIComponent(username)}`);
    });
});
