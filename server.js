const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(
  session({
    secret: "studydesk-secret-key-badal-dena",
    resave: false,
    saveUninitialized: false
  })
);
app.use(express.static("public"));

const db = new Database("studydesk.db");

// ---------- Tables ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT ''
  )
`);

// Purane tables mein user_id ka column jodo (agar pehle se nahi hai)
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare("PRAGMA table_info(" + table + ")").all();
  const exists = cols.some(function (c) {
    return c.name === column;
  });
  if (!exists) {
    db.exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
  }
}

addColumnIfMissing("tasks", "user_id", "INTEGER");
addColumnIfMissing("expenses", "user_id", "INTEGER");
addColumnIfMissing("notes", "user_id", "INTEGER");

// ---------- Login ka pehra ----------
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Pehle login karo" });
  }
  next();
}

app.use("/api/tasks", requireLogin);
app.use("/api/expenses", requireLogin);
app.use("/api/notes", requireLogin);

// ---------- Auth ----------
app.post("/api/register", function (req, res) {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (username.length < 3) {
    return res.status(400).json({ error: "Username kam az kam 3 harf ka ho" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password kam az kam 6 harf ka ho" });
  }

  const exists = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);

  if (exists) {
    return res.status(400).json({ error: "Ye username pehle se maujood hai" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hash);

  req.session.userId = info.lastInsertRowid;
  req.session.username = username;
  res.status(201).json({ username: username });
});

app.post("/api/login", function (req, res) {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = req.body.password || "";

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Username ya password ghalat hai" });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post("/api/logout", function (req, res) {
  req.session.destroy(function () {
    res.json({ message: "Logout ho gaya" });
  });
});

app.get("/api/me", function (req, res) {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, username: req.session.username });
});

// ---------- Tasks ----------
app.get("/api/tasks", function (req, res) {
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE user_id = ?")
    .all(req.session.userId);
  res.json(tasks);
});

app.post("/api/tasks", function (req, res) {
  const text = (req.body.text || "").trim();

  if (text === "") {
    return res.status(400).json({ error: "Task ka text zaroori hai" });
  }

  const info = db
    .prepare("INSERT INTO tasks (text, user_id) VALUES (?, ?)")
    .run(text, req.session.userId);
  res.status(201).json({ id: info.lastInsertRowid, text: text, done: 0 });
});

app.put("/api/tasks/:id", function (req, res) {
  const info = db
    .prepare("UPDATE tasks SET done = 1 - done WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: "Task nahi mila" });
  }

  res.json({ message: "Update ho gaya" });
});

app.delete("/api/tasks/:id", function (req, res) {
  db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Delete ho gaya" });
});

// ---------- Expenses ----------
app.get("/api/expenses", function (req, res) {
  const expenses = db
    .prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY id DESC")
    .all(req.session.userId);
  res.json(expenses);
});

app.post("/api/expenses", function (req, res) {
  const title = (req.body.title || "").trim();
  const amount = Number(req.body.amount);
  const category = (req.body.category || "Other").trim();

  if (title === "" || !(amount > 0)) {
    return res.status(400).json({ error: "Naam aur sahi raqam zaroori hai" });
  }

  const info = db
    .prepare(
      "INSERT INTO expenses (title, amount, category, user_id) VALUES (?, ?, ?, ?)"
    )
    .run(title, amount, category, req.session.userId);

  res.status(201).json({ id: info.lastInsertRowid });
});

app.delete("/api/expenses/:id", function (req, res) {
  db.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Delete ho gaya" });
});

// ---------- Notes ----------
app.get("/api/notes", function (req, res) {
  const notes = db
    .prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY id DESC")
    .all(req.session.userId);
  res.json(notes);
});

app.post("/api/notes", function (req, res) {
  const title = (req.body.title || "").trim();
  const content = (req.body.content || "").trim();

  if (title === "") {
    return res.status(400).json({ error: "Title zaroori hai" });
  }

  const info = db
    .prepare("INSERT INTO notes (title, content, user_id) VALUES (?, ?, ?)")
    .run(title, content, req.session.userId);

  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/notes/:id", function (req, res) {
  const title = (req.body.title || "").trim();
  const content = (req.body.content || "").trim();

  if (title === "") {
    return res.status(400).json({ error: "Title zaroori hai" });
  }

  const info = db
    .prepare(
      "UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?"
    )
    .run(title, content, req.params.id, req.session.userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: "Note nahi mila" });
  }

  res.json({ message: "Update ho gaya" });
});

app.delete("/api/notes/:id", function (req, res) {
  db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Delete ho gaya" });
});

// ---------- Server start ----------
app.listen(PORT, function () {
  console.log("Server chal raha hai: http://localhost:" + PORT);
});