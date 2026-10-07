const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);
app.use(express.static("public"));

const db = new Database(process.env.DB_PATH || "studydesk.db");

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

// Add the user_id column to older tables (if it is missing)
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

// ---------- Login guard ----------
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in first" });
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
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const exists = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);

  if (exists) {
    return res.status(400).json({ error: "This username is already taken" });
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
    return res.status(401).json({ error: "Wrong username or password" });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post("/api/logout", function (req, res) {
  req.session.destroy(function () {
    res.json({ message: "Logged out" });
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
    return res.status(400).json({ error: "Task text is required" });
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
    return res.status(404).json({ error: "Task not found" });
  }

  res.json({ message: "Updated" });
});

app.delete("/api/tasks/:id", function (req, res) {
  db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Deleted" });
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
    return res.status(400).json({ error: "Title and a valid amount are required" });
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
  res.json({ message: "Deleted" });
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
    return res.status(400).json({ error: "Title is required" });
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
    return res.status(400).json({ error: "Title is required" });
  }

  const info = db
    .prepare(
      "UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?"
    )
    .run(title, content, req.params.id, req.session.userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.json({ message: "Updated" });
});

app.delete("/api/notes/:id", function (req, res) {
  db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Deleted" });
});

// ---------- Assignments ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Not started',
    marks TEXT NOT NULL DEFAULT ''
  )
`);

const allowedStatus = ["Not started", "In progress", "Submitted"];

app.use("/api/assignments", requireLogin);

app.get("/api/assignments", function (req, res) {
  const items = db
    .prepare(
      `SELECT * FROM assignments
       WHERE user_id = ?
       ORDER BY CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, id DESC`
    )
    .all(req.session.userId);
  res.json(items);
});

app.post("/api/assignments", function (req, res) {
  const subject = (req.body.subject || "").trim();
  const title = (req.body.title || "").trim();
  const dueDate = (req.body.due_date || "").trim();

  if (subject === "" || title === "") {
    return res.status(400).json({ error: "Subject and title are required" });
  }

  const info = db
    .prepare(
      "INSERT INTO assignments (user_id, subject, title, due_date) VALUES (?, ?, ?, ?)"
    )
    .run(req.session.userId, subject, title, dueDate);

  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/assignments/:id", function (req, res) {
  const status = req.body.status;
  const marks = (req.body.marks || "").toString().trim();

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const info = db
    .prepare(
      "UPDATE assignments SET status = ?, marks = ? WHERE id = ? AND user_id = ?"
    )
    .run(status, marks, req.params.id, req.session.userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: "Assignment not found" });
  }

  res.json({ message: "Updated" });
});

app.delete("/api/assignments/:id", function (req, res) {
  db.prepare("DELETE FROM assignments WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Deleted" });
});

// ---------- Budgets ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    UNIQUE(user_id, category)
  )
`);

const budgetCategories = ["Food", "Transport", "Study", "Other"];

app.use("/api/budgets", requireLogin);

// Budget and this month's spending for every category
app.get("/api/budgets", function (req, res) {
  const budgets = db
    .prepare("SELECT category, amount FROM budgets WHERE user_id = ?")
    .all(req.session.userId);

  const spent = db
    .prepare(
      `SELECT category, SUM(amount) AS total
       FROM expenses
       WHERE user_id = ?
         AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
       GROUP BY category`
    )
    .all(req.session.userId);

  const result = budgetCategories.map(function (cat) {
    const b = budgets.find(function (x) {
      return x.category === cat;
    });
    const s = spent.find(function (x) {
      return x.category === cat;
    });

    return {
      category: cat,
      budget: b ? b.amount : 0,
      spent: s ? s.total : 0
    };
  });

  res.json(result);
});

// Set a category budget (0 removes it)
app.put("/api/budgets/:category", function (req, res) {
  const category = req.params.category;
  const amount = Number(req.body.amount);

  if (!budgetCategories.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  if (!(amount >= 0)) {
    return res.status(400).json({ error: "Please enter a valid amount" });
  }

  if (amount === 0) {
    db.prepare("DELETE FROM budgets WHERE user_id = ? AND category = ?").run(
      req.session.userId,
      category
    );
  } else {
    db.prepare(
      `INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)
       ON CONFLICT(user_id, category) DO UPDATE SET amount = excluded.amount`
    ).run(req.session.userId, category, amount);
  }

  res.json({ message: "Saved" });
});

// ---------- Server start ----------
app.listen(PORT, function () {
  console.log("Server running at http://localhost:" + PORT);
});