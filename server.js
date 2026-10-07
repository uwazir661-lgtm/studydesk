const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { Pool, types } = require("pg");
const { AsyncLocalStorage } = require("node:async_hooks");
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET must be set in production");
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(
  session({
    secret: sessionSecret || "development-only-secret-change-me",
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
app.get("/healthz", function (req, res) {
  res.status(200).json({ status: "ok" });
});

const usePostgres = Boolean(process.env.DATABASE_URL);
const sqliteDb = usePostgres ? null : new Database(process.env.DB_PATH || "studydesk.db");
const postgresPool = usePostgres ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000
}) : null;
const transactionContext = new AsyncLocalStorage();

function convertSqlForPostgres(sql) {
  return sql
    .replace(/strftime\('%Y-%m', created_at\) = strftime\('%Y-%m', 'now'\)/g, "TO_CHAR(created_at::timestamp, 'YYYY-MM') = TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM')")
    .replace(/date\(completed_at, 'localtime'\)/g, "DATE(NULLIF(completed_at, '')::timestamp)")
    .replace(/date\('now', 'localtime', '-365 days'\)/g, "(CURRENT_DATE - INTERVAL '365 days')")
    .replace(/COLLATE NOCASE/gi, "")
    .replace(/\?/g, function () {
      convertSqlForPostgres.placeholderIndex = (convertSqlForPostgres.placeholderIndex || 0) + 1;
      return "$" + convertSqlForPostgres.placeholderIndex;
    });
}

function makePostgresStatement(sql) {
  function execute(method, params) {
    const insert = /^\s*INSERT\b/i.test(sql);
    convertSqlForPostgres.placeholderIndex = 0;
    let query = convertSqlForPostgres(sql);
    query = query.replace(/\b(completed_at|updated_at|notified_at)\s*=\s*CURRENT_TIMESTAMP\b/gi, "$1 = CURRENT_TIMESTAMP::text");
    if (method === "run" && insert && !/\bRETURNING\b/i.test(query)) query += " RETURNING id";
    const client = transactionContext.getStore() || postgresPool;
    return client.query(query, params).then(function (result) {
      if (method === "all") return result.rows;
      if (method === "get") return result.rows[0];
      return { lastInsertRowid: result.rows[0] && result.rows[0].id, changes: result.rowCount };
    });
  }
  return {
    all: function (...params) { return execute("all", params); },
    get: function (...params) { return execute("get", params); },
    run: function (...params) { return execute("run", params); }
  };
}

const db = usePostgres ? {
  prepare: makePostgresStatement,
  exec: function (sql) {
    const client = transactionContext.getStore() || postgresPool;
    return client.query(sql);
  },
  transaction: function (callback) {
    return async function () {
      const client = await postgresPool.connect();
      try {
        await client.query("BEGIN");
        const value = await transactionContext.run(client, callback);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
  }
} : {
  prepare: sqliteDb.prepare.bind(sqliteDb),
  exec: sqliteDb.exec.bind(sqliteDb),
  transaction: function (callback) {
    return async function () {
      sqliteDb.exec("BEGIN");
      try {
        const value = await callback();
        sqliteDb.exec("COMMIT");
        return value;
      } catch (error) {
        sqliteDb.exec("ROLLBACK");
        throw error;
      }
    };
  }
};

async function initializePostgresSchema() {
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      email TEXT UNIQUE, date_of_birth TEXT
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGSERIAL PRIMARY KEY, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
      user_id BIGINT, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '', recurrence TEXT NOT NULL DEFAULT 'none', series_id BIGINT,
      completed_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL,
      category TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text, user_id BIGINT
    );
    CREATE TABLE IF NOT EXISTS notes (
      id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text, user_id BIGINT,
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS study_plan (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, day_of_week INTEGER NOT NULL,
      subject TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS exams (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '', exam_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS syllabus_chapters (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, subject TEXT NOT NULL,
      chapter TEXT NOT NULL, is_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text, UNIQUE(user_id, subject, chapter)
    );
    CREATE TABLE IF NOT EXISTS flashcards (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, question TEXT NOT NULL,
      answer TEXT NOT NULL, source_note_id BIGINT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE UNIQUE INDEX IF NOT EXISTS flashcards_one_per_note
      ON flashcards(user_id, source_note_id) WHERE source_note_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS quizzes (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id BIGSERIAL PRIMARY KEY, quiz_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      prompt TEXT NOT NULL, options TEXT NOT NULL, correct_index INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id BIGSERIAL PRIMARY KEY, quiz_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      score INTEGER NOT NULL, total INTEGER NOT NULL, completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL,
      remind_at TEXT NOT NULL, notified_at TEXT NOT NULL DEFAULT '', is_done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS grade_entries (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, subject TEXT NOT NULL,
      assessment TEXT NOT NULL, score DOUBLE PRECISION NOT NULL, total DOUBLE PRECISION NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS grade_targets (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, subject TEXT NOT NULL,
      target_percent DOUBLE PRECISION NOT NULL, UNIQUE(user_id, subject)
    );
    CREATE TABLE IF NOT EXISTS classes (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, subject TEXT NOT NULL,
      day_of_week INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      room TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, minutes INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, subject TEXT NOT NULL,
      title TEXT NOT NULL, due_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Not started',
      marks TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, category TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL, UNIQUE(user_id, category)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);
  `);
}

// ---------- Tables ----------
if (!usePostgres) {
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT UNIQUE,
    date_of_birth TEXT
  )
`);

// Purane databases ke users table mein signup profile fields add karo.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map(function (column) { return column.name; });
if (!userColumns.includes("email")) db.exec("ALTER TABLE users ADD COLUMN email TEXT");
if (!userColumns.includes("date_of_birth")) db.exec("ALTER TABLE users ADD COLUMN date_of_birth TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email)");

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
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS study_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    subject TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    goal TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    exam_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS syllabus_chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    chapter TEXT NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, subject, chapter)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_note_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS flashcards_one_per_note
  ON flashcards(user_id, source_note_id) WHERE source_note_id IS NOT NULL`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    notified_at TEXT NOT NULL DEFAULT '',
    is_done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS grade_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    assessment TEXT NOT NULL,
    score REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS grade_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT COLLATE NOCASE NOT NULL,
    target_percent REAL NOT NULL,
    UNIQUE(user_id, subject)
  );
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    minutes INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
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
addColumnIfMissing("tasks", "priority", "TEXT NOT NULL DEFAULT 'Normal'");
addColumnIfMissing("tasks", "due_date", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("tasks", "subject", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("tasks", "recurrence", "TEXT NOT NULL DEFAULT 'none'");
addColumnIfMissing("tasks", "series_id", "INTEGER");
addColumnIfMissing("tasks", "completed_at", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("expenses", "user_id", "INTEGER");
addColumnIfMissing("notes", "user_id", "INTEGER");
addColumnIfMissing("notes", "pinned", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("notes", "created_at", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("notes", "updated_at", "TEXT NOT NULL DEFAULT ''");
db.prepare("UPDATE notes SET created_at = CURRENT_TIMESTAMP WHERE created_at = ''").run();
db.prepare("UPDATE notes SET updated_at = created_at WHERE updated_at = ''").run();
}

const databaseReady = usePostgres ? initializePostgresSchema() : Promise.resolve();

// ---------- Login guard ----------
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please log in first" });
  }
  next();
}

function establishSession(req, res, user, statusCode) {
  req.session.regenerate(function (error) {
    if (error) {
      return res.status(500).json({ error: "Could not start your session" });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.save(function (saveError) {
      if (saveError) {
        return res.status(500).json({ error: "Could not save your session" });
      }
      res.status(statusCode || 200).json({ username: user.username });
    });
  });
}

app.use("/api/tasks", requireLogin);
app.use("/api/expenses", requireLogin);
app.use("/api/notes", requireLogin);
app.use("/api/study-plan", requireLogin);
app.use("/api/exams", requireLogin);
app.use("/api/syllabus", requireLogin);
app.use("/api/flashcards", requireLogin);
app.use("/api/quizzes", requireLogin);
app.use("/api/quiz-attempts", requireLogin);
app.use("/api/reminders", requireLogin);
app.use("/api/grades", requireLogin);
app.use("/api/classes", requireLogin);
app.use("/api/analytics", requireLogin);

// ---------- Auth ----------
app.post("/api/register", async function (req, res) {
  const username = (req.body.username || "").trim().toLowerCase();
  const email = (req.body.email || "").trim().toLowerCase();
  const dateOfBirth = (req.body.dateOfBirth || "").trim();
  const password = req.body.password || "";

  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email address enter karein" });
  }
  const parsedDob = new Date(dateOfBirth + "T00:00:00.000Z");
  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
    && !Number.isNaN(parsedDob.getTime())
    && parsedDob.toISOString().slice(0, 10) === dateOfBirth
    && dateOfBirth <= new Date().toISOString().slice(0, 10);
  if (!validDob) {
    return res.status(400).json({ error: "Sahi date of birth select karein" });
  }

  const exists = await db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);

  if (exists) {
    return res.status(400).json({ error: "This username is already taken" });
  }

  const emailExists = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (emailExists) {
    return res.status(400).json({ error: "Is email se account pehle se bana hua hai" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = await db
    .prepare("INSERT INTO users (username, password_hash, email, date_of_birth) VALUES (?, ?, ?, ?)")
    .run(username, hash, email, dateOfBirth);

  establishSession(req, res, { id: info.lastInsertRowid, username: username }, 201);
});

app.post("/api/login", async function (req, res) {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = req.body.password || "";

  const user = await db
    .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .get(username, username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Wrong username or password" });
  }

  establishSession(req, res, user);
});

app.post("/api/logout", async function (req, res) {
  req.session.destroy(function (error) {
    if (error) {
      return res.status(500).json({ error: "Could not log out" });
    }
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});

app.get("/api/me", async function (req, res) {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, username: req.session.username });
});

// ---------- StudyDesk AI agent ----------
const agentTools = [
  {
    type: "function",
    name: "get_study_overview",
    description: "Read this logged-in user's open tasks and assignments to answer planning questions.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true
  },
  {
    type: "function",
    name: "create_task",
    description: "Create a task only when the user explicitly asks to add or create one. Use an empty due_date if none was given.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
        priority: { type: "string", enum: ["Low", "Normal", "High"] },
        due_date: { type: "string", description: "Due date as YYYY-MM-DD, or an empty string." }
      },
      required: ["text", "priority", "due_date"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "create_assignment",
    description: "Create an assignment only when the user explicitly asks to add or create one. Use an empty due_date if none was given.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        title: { type: "string" },
        due_date: { type: "string", description: "Due date as YYYY-MM-DD, or an empty string." }
      },
      required: ["subject", "title", "due_date"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "complete_task",
    description: "Mark one of the user's tasks complete only when they explicitly ask to complete it.",
    parameters: {
      type: "object",
      properties: { task_id: { type: "integer" } },
      required: ["task_id"],
      additionalProperties: false
    },
    strict: true
  }
];
let agentCreditsUnavailable = false;

async function getAgentToolResult(name, args, userId) {
  if (name === "get_study_overview") {
    return {
      tasks: await db.prepare(
        "SELECT id, text, done, priority, due_date FROM tasks WHERE user_id = ? ORDER BY done, due_date LIMIT 40"
      ).all(userId),
      assignments: await db.prepare(
        "SELECT id, subject, title, due_date, status, marks FROM assignments WHERE user_id = ? ORDER BY due_date LIMIT 40"
      ).all(userId)
    };
  }

  if (name === "create_task") {
    const text = String(args.text || "").trim();
    const priority = args.priority;
    const dueDate = String(args.due_date || "").trim();
    if (!text || !["Low", "Normal", "High"].includes(priority) ||
        (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
      return { error: "Task details were invalid; ask the user for the missing or corrected information." };
    }
    const info = await db.prepare(
      "INSERT INTO tasks (text, user_id, priority, due_date) VALUES (?, ?, ?, ?)"
    ).run(text, userId, priority, dueDate);
    return { created: true, id: info.lastInsertRowid, text: text, priority: priority, due_date: dueDate };
  }

  if (name === "create_assignment") {
    const subject = String(args.subject || "").trim();
    const title = String(args.title || "").trim();
    const dueDate = String(args.due_date || "").trim();
    if (!subject || !title || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
      return { error: "Assignment details were invalid; ask the user for the missing or corrected information." };
    }
    const info = await db.prepare(
      "INSERT INTO assignments (user_id, subject, title, due_date) VALUES (?, ?, ?, ?)"
    ).run(userId, subject, title, dueDate);
    return { created: true, id: info.lastInsertRowid, subject: subject, title: title, due_date: dueDate };
  }

  if (name === "complete_task") {
    const info = await db.prepare(
      "UPDATE tasks SET done = 1 WHERE id = ? AND user_id = ?"
    ).run(args.task_id, userId);
    return info.changes ? { completed: true } : { error: "Task not found for this user." };
  }

  return { error: "This action is not available." };
}

function getResponseText(response) {
  return (response.output || [])
    .filter(function (item) { return item.type === "message"; })
    .flatMap(function (item) { return item.content || []; })
    .filter(function (item) { return item.type === "output_text"; })
    .map(function (item) { return item.text; })
    .join("\n");
}

async function agentApiError(response) {
  let details = {};
  try {
    details = await response.json();
  } catch (error) {}
  const code = details.error && details.error.code;
  console.error("OpenAI API request failed:", response.status, code || "no_error_code");

  if (response.status === 401) {
    return { code: code, message: "OpenAI ne API key accept nahi ki. .env mein key dobara check karein aur server restart karein." };
  }
  if (response.status === 403) {
    return { code: code, message: "API key ke project mein is model/API ki permission nahi. Project access check karein." };
  }
  if (response.status === 404) {
    return { code: code, message: "Selected model is API project ke liye available nahi. OPENAI_MODEL setting check karein." };
  }
  if (response.status === 429) {
    return { code: code, message: "API usage limit ya billing issue hai. OpenAI Platform par project usage/billing check karein." };
  }
  return { code: code, message: "OpenAI API ne request reject ki (HTTP " + response.status + "). Server terminal mein safe error code check karein." };
}

async function getLocalStudyReply(message, userId, today) {
  const openTasks = await db.prepare(
    "SELECT text, priority, due_date FROM tasks WHERE user_id = ? AND done = 0"
  ).all(userId);
  const pendingAssignments = await db.prepare(
    "SELECT subject, title, due_date, status FROM assignments WHERE user_id = ? AND status != 'Submitted'"
  ).all(userId);
  const romanUrdu = /\b(kya|aaj|aj|mera|meri|kar|karo|hai|ke|liye|bata|dikhao|parhna)\b/i.test(message);
  const wantsAction = /\b(add|create|complete|finish|mark|bana|banao|mukammal)\b/i.test(message) &&
    /\b(task|tasks|assignment|assignments|homework|record)\b/i.test(message);
  const wantsDeadlines = /deadline|due|assignment|submission|jama|kab tak/i.test(message);

  if (wantsAction) {
    return romanUrdu
      ? "Local mode mein main records khud add ya update nahi kar sakta. Tasks ya Assignments tab se entry kar lein; main yahan aapka study plan bana sakta hoon."
      : "In local mode I can make a plan, but I can't change records. Add or update it in the Tasks or Assignments tab, and I can help you prioritize it here.";
  }

  if (openTasks.length === 0 && pendingAssignments.length === 0) {
    return romanUrdu
      ? "Abhi koi open task ya pending assignment nahi mila. Tasks ya Assignments tab mein apna kaam add karein, phir main aapko order suggest kar dunga."
      : "I couldn't find any open tasks or pending assignments. Add your work in the Tasks or Assignments tab and I can help you prioritize it.";
  }

  const items = [];
  if (wantsDeadlines) {
    pendingAssignments.forEach(function (item) {
      items.push({ kind: "Assignment", name: item.title + " (" + item.subject + ")", date: item.due_date, priority: 1 });
    });
  } else {
    openTasks.forEach(function (item) {
      items.push({ kind: "Task", name: item.text, date: item.due_date, priority: item.priority === "High" ? 0 : item.priority === "Low" ? 2 : 1 });
    });
    pendingAssignments.forEach(function (item) {
      items.push({ kind: "Assignment", name: item.title + " (" + item.subject + ")", date: item.due_date, priority: 1 });
    });
  }

  function dueRank(date) {
    if (!date) return 9999;
    const days = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
    return days;
  }
  items.sort(function (a, b) {
    return dueRank(a.date) - dueRank(b.date) || a.priority - b.priority;
  });

  const selected = items.slice(0, 5);
  const lines = selected.map(function (item, index) {
    let deadline = "";
    if (item.date) {
      const days = dueRank(item.date);
      deadline = days < 0 ? " — " + Math.abs(days) + " day(s) overdue" : days === 0 ? " — due today" : days === 1 ? " — due tomorrow" : " — due " + item.date;
    }
    return (index + 1) + ". " + item.kind + ": " + item.name + deadline;
  });

  if (romanUrdu) {
    return "Aap ke kaam ki tarjeeh (" + today + "):\n" + lines.join("\n") +
      "\n\nPehle 25-minute focus session mein pehla kaam karein, phir chhota break lein.";
  }
  return "A practical order for your work (" + today + "):\n" + lines.join("\n") +
    "\n\nStart with the first item for one 25-minute focus session, then take a short break.";
}

app.post("/api/agent", requireLogin, async function (req, res) {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 2000) {
    return res.status(400).json({ error: "Write a message up to 2,000 characters." });
  }
  const today = typeof req.body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.today)
    ? req.body.today
    : new Date().toISOString().slice(0, 10);

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_ENABLED === "false" || agentCreditsUnavailable) {
    return res.json({ reply: await getLocalStudyReply(message, req.session.userId, today), offline: true });
  }

  const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];
  const input = history
    .filter(function (item) {
      return item && ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string" && item.content.length <= 2000;
    })
    .map(function (item) { return { role: item.role, content: item.content }; });
  if (!input.length || input[input.length - 1].role !== "user" ||
      input[input.length - 1].content !== message) {
    input.push({ role: "user", content: message });
  }

  const instructions = [
    "You are StudyDesk AI, a friendly personal study planner.",
    "The user's local date is " + today + ". Use it to interpret words like today and tomorrow.",
    "Reply in the language and style used by the student, including Roman Urdu when they use it.",
    "Use get_study_overview for questions that depend on their tasks or assignment deadlines.",
    "Give realistic, prioritized study plans and mention exact task or assignment names from the data.",
    "Never claim an action happened unless its tool result confirms it.",
    "Never create, complete, or change records unless the user clearly asks you to do so.",
    "If the requested record details are unclear, ask a short follow-up instead of guessing.",
    "Do not reveal or discuss other users' data. Keep replies concise and practical."
  ].join(" ");

  try {
    let response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-luna",
        instructions: instructions,
        input: input,
        tools: agentTools,
        store: false
      })
    });

    if (!response.ok) {
      const error = await agentApiError(response);
      if (["credit_balance_exhausted", "insufficient_quota", "organization_usage_limit_exceeded"].includes(error.code)) {
        agentCreditsUnavailable = true;
        return res.json({ reply: await getLocalStudyReply(message, req.session.userId, today), offline: true });
      }
      return res.status(502).json({ error: error.message });
    }

    let result = await response.json();
    for (let round = 0; round < 4; round += 1) {
      const calls = (result.output || []).filter(function (item) { return item.type === "function_call"; });
      if (calls.length === 0) break;

      input.push(...result.output);
      for (const call of calls) {
        let toolResult;
        try {
          toolResult = await getAgentToolResult(call.name, JSON.parse(call.arguments), req.session.userId);
        } catch (error) {
          toolResult = { error: "The requested action could not be completed." };
        }
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(toolResult)
        });
      }

      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-6-luna",
          instructions: instructions,
          input: input,
          tools: agentTools,
          store: false
        })
      });
      if (!response.ok) {
        const error = await agentApiError(response);
        return res.status(502).json({ error: error.message });
      }
      result = await response.json();
    }

    const reply = getResponseText(result);
    if (!reply) {
      return res.status(502).json({ error: "The AI service returned an empty reply. Please try again." });
    }
    res.json({ reply: reply });
  } catch (error) {
    res.status(502).json({ error: "Could not reach the AI service. Check the server connection and try again." });
  }
});

// ---------- Weekly Study Plan ----------
function parseStudyPlanInput(body) {
  const day = Number(body.day_of_week);
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const startTime = typeof body.start_time === "string" ? body.start_time : "";
  const endTime = typeof body.end_time === "string" ? body.end_time : "";
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Select a valid day" };
  if (!subject || subject.length > 50) return { error: "Subject is required (maximum 50 characters)" };
  if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
    return { error: "End time must be later than the start time" };
  }
  if (goal.length > 180) return { error: "Study goal must be 180 characters or fewer" };
  return { value: { day, subject, startTime, endTime, goal } };
}

async function hasStudyPlanConflict(userId, block, excludedId) {
  const baseQuery = `SELECT id FROM study_plan
    WHERE user_id = ? AND day_of_week = ? AND start_time < ? AND end_time > ?`;
  const query = excludedId === undefined ? baseQuery : baseQuery + " AND id <> ?";
  const params = [userId, block.day, block.endTime, block.startTime];
  if (excludedId !== undefined) params.push(excludedId);
  return Boolean(await db.prepare(query).get(...params));
}

app.get("/api/study-plan", async function (req, res) {
  const blocks = await db.prepare(
    "SELECT id, day_of_week, subject, start_time, end_time, goal FROM study_plan WHERE user_id = ? ORDER BY day_of_week, start_time"
  ).all(req.session.userId);
  res.json(blocks);
});

app.post("/api/study-plan", async function (req, res) {
  const parsed = parseStudyPlanInput(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (await hasStudyPlanConflict(req.session.userId, parsed.value)) {
    return res.status(409).json({ error: "This study block overlaps another block on that day" });
  }
  const block = parsed.value;
  const info = await db.prepare(
    "INSERT INTO study_plan (user_id, day_of_week, subject, start_time, end_time, goal) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(req.session.userId, block.day, block.subject, block.startTime, block.endTime, block.goal);
  res.status(201).json({ id: info.lastInsertRowid, ...block });
});

app.put("/api/study-plan/:id", async function (req, res) {
  const existing = await db.prepare("SELECT id FROM study_plan WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: "Study block not found" });
  const parsed = parseStudyPlanInput(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (await hasStudyPlanConflict(req.session.userId, parsed.value, req.params.id)) {
    return res.status(409).json({ error: "This study block overlaps another block on that day" });
  }
  const block = parsed.value;
  await db.prepare(
    "UPDATE study_plan SET day_of_week = ?, subject = ?, start_time = ?, end_time = ?, goal = ? WHERE id = ? AND user_id = ?"
  ).run(block.day, block.subject, block.startTime, block.endTime, block.goal, req.params.id, req.session.userId);
  res.json({ message: "Updated" });
});

app.delete("/api/study-plan/:id", async function (req, res) {
  const result = await db.prepare("DELETE FROM study_plan WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Study block not found" });
  res.json({ message: "Deleted" });
});

// ---------- Exam countdown ----------
app.get("/api/exams", async function (req, res) {
  const exams = await db.prepare(
    "SELECT id, title, subject, exam_date FROM exams WHERE user_id = ? ORDER BY exam_date, id"
  ).all(req.session.userId);
  res.json(exams);
});

app.post("/api/exams", async function (req, res) {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
  const examDate = typeof req.body.exam_date === "string" ? req.body.exam_date : "";
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examDate);
  const parsedDate = dateMatch ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])) : null;
  const validDate = parsedDate && parsedDate.getFullYear() === Number(dateMatch[1]) &&
    parsedDate.getMonth() === Number(dateMatch[2]) - 1 && parsedDate.getDate() === Number(dateMatch[3]);

  if (!title || title.length > 80) return res.status(400).json({ error: "Exam name is required (maximum 80 characters)" });
  if (subject.length > 50) return res.status(400).json({ error: "Subject must be 50 characters or fewer" });
  if (!validDate) return res.status(400).json({ error: "Enter a valid exam date" });

  const result = await db.prepare(
    "INSERT INTO exams (user_id, title, subject, exam_date) VALUES (?, ?, ?, ?)"
  ).run(req.session.userId, title, subject, examDate);
  res.status(201).json({ id: result.lastInsertRowid, title, subject, exam_date: examDate });
});

app.delete("/api/exams/:id", async function (req, res) {
  const result = await db.prepare("DELETE FROM exams WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Exam not found" });
  res.json({ message: "Deleted" });
});

// ---------- Syllabus tracker ----------
app.get("/api/syllabus", async function (req, res) {
  const chapters = await db.prepare(
    "SELECT id, subject, chapter, is_complete FROM syllabus_chapters WHERE user_id = ? ORDER BY subject COLLATE NOCASE, id"
  ).all(req.session.userId);
  res.json(chapters);
});

app.post("/api/syllabus", async function (req, res) {
  const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
  const chapter = typeof req.body.chapter === "string" ? req.body.chapter.trim() : "";
  if (!subject || subject.length > 50) return res.status(400).json({ error: "Subject zaroor likhein (maximum 50 characters)." });
  if (!chapter || chapter.length > 100) return res.status(400).json({ error: "Chapter ka naam zaroor likhein (maximum 100 characters)." });

  try {
    const result = await db.prepare(
      "INSERT INTO syllabus_chapters (user_id, subject, chapter) VALUES (?, ?, ?)"
    ).run(req.session.userId, subject, chapter);
    res.status(201).json({ id: result.lastInsertRowid, subject, chapter, is_complete: 0 });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Yeh chapter is subject mein pehle se add hai." });
    }
    throw error;
  }
});

app.put("/api/syllabus/:id", async function (req, res) {
  const isComplete = req.body.is_complete === true || req.body.is_complete === 1 ? 1 : 0;
  const result = await db.prepare(
    "UPDATE syllabus_chapters SET is_complete = ? WHERE id = ? AND user_id = ?"
  ).run(isComplete, req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Chapter nahi mila." });
  res.json({ message: "Updated" });
});

app.delete("/api/syllabus/:id", async function (req, res) {
  const result = await db.prepare("DELETE FROM syllabus_chapters WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Chapter nahi mila." });
  res.json({ message: "Deleted" });
});

// ---------- Flashcards ----------
app.get("/api/flashcards", async function (req, res) {
  const cards = await db.prepare(
    "SELECT id, question, answer, source_note_id FROM flashcards WHERE user_id = ? ORDER BY id DESC"
  ).all(req.session.userId);
  res.json(cards);
});

app.post("/api/flashcards", async function (req, res) {
  const question = typeof req.body.question === "string" ? req.body.question.trim() : "";
  const answer = typeof req.body.answer === "string" ? req.body.answer.trim() : "";
  const sourceNoteId = req.body.source_note_id === undefined || req.body.source_note_id === null
    ? null : Number(req.body.source_note_id);
  if (!question || question.length > 200) return res.status(400).json({ error: "Question zaroor likhein (maximum 200 characters)." });
  if (!answer || answer.length > 10000) return res.status(400).json({ error: "Answer zaroor likhein (maximum 10,000 characters)." });
  if (sourceNoteId !== null && (!Number.isInteger(sourceNoteId) || sourceNoteId < 1)) {
    return res.status(400).json({ error: "Invalid note." });
  }
  if (sourceNoteId !== null) {
    const note = await db.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").get(sourceNoteId, req.session.userId);
    if (!note) return res.status(404).json({ error: "Note nahi mila." });
  }
  try {
    const result = await db.prepare(
      "INSERT INTO flashcards (user_id, question, answer, source_note_id) VALUES (?, ?, ?, ?)"
    ).run(req.session.userId, question, answer, sourceNoteId);
    res.status(201).json({ id: result.lastInsertRowid, question, answer, source_note_id: sourceNoteId });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Is note ka flashcard pehle se bana hua hai." });
    }
    throw error;
  }
});

app.delete("/api/flashcards/:id", async function (req, res) {
  const result = await db.prepare("DELETE FROM flashcards WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Flashcard nahi mila." });
  res.json({ message: "Deleted" });
});

// ---------- Practice quizzes ----------
app.get("/api/quizzes", async function (req, res) {
  const quizzes = await db.prepare(`
    SELECT q.id, q.title, q.created_at,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.user_id = q.user_id) AS question_count,
      (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = q.user_id) AS attempt_count
    FROM quizzes q WHERE q.user_id = ? ORDER BY q.id DESC
  `).all(req.session.userId);
  res.json(quizzes);
});

app.post("/api/quizzes", async function (req, res) {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
  if (!title || title.length > 80) return res.status(400).json({ error: "Quiz ka topic likhein (maximum 80 characters)." });
  if (questions.length < 1 || questions.length > 20) {
    return res.status(400).json({ error: "Quiz mein 1 se 20 questions hone chahiye." });
  }

  const validated = [];
  for (const item of questions) {
    const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
    const options = Array.isArray(item.options) ? item.options.map(function (option) {
      return typeof option === "string" ? option.trim() : "";
    }) : [];
    const correctIndex = Number(item.correct_index);
    if (!prompt || prompt.length > 500 || options.length !== 4 ||
        options.some(function (option) { return !option || option.length > 200; }) ||
        !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      return res.status(400).json({ error: "Har question ke liye sawal, 4 choices aur sahi jawab select karein." });
    }
    validated.push({ prompt, options, correctIndex });
  }

  const createQuiz = db.transaction(async function () {
    const result = await db.prepare("INSERT INTO quizzes (user_id, title) VALUES (?, ?)")
      .run(req.session.userId, title);
    const insertQuestion = await db.prepare(
      "INSERT INTO quiz_questions (quiz_id, user_id, prompt, options, correct_index) VALUES (?, ?, ?, ?, ?)"
    );
    for (const item of validated) {
      await insertQuestion.run(result.lastInsertRowid, req.session.userId, item.prompt, JSON.stringify(item.options), item.correctIndex);
    }
    return result.lastInsertRowid;
  });
  const id = await createQuiz();
  res.status(201).json({ id, title, question_count: validated.length, attempt_count: 0 });
});

app.get("/api/quizzes/:id", async function (req, res) {
  const quiz = await db.prepare("SELECT id, title FROM quizzes WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!quiz) return res.status(404).json({ error: "Quiz nahi mila." });
  const questions = await db.prepare(
    "SELECT id, prompt, options FROM quiz_questions WHERE quiz_id = ? AND user_id = ? ORDER BY id"
  ).all(quiz.id, req.session.userId).map(function (question) {
    return { id: question.id, prompt: question.prompt, options: JSON.parse(question.options) };
  });
  res.json({ ...quiz, questions });
});

app.post("/api/quizzes/:id/attempts", async function (req, res) {
  const quiz = await db.prepare("SELECT id, title FROM quizzes WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!quiz) return res.status(404).json({ error: "Quiz nahi mila." });
  const questions = await db.prepare(
    "SELECT id, correct_index FROM quiz_questions WHERE quiz_id = ? AND user_id = ? ORDER BY id"
  ).all(quiz.id, req.session.userId);
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  if (answers.length !== questions.length) return res.status(400).json({ error: "Har sawal ka jawab dein." });
  const answerMap = new Map();
  for (const answer of answers) {
    const questionId = Number(answer.question_id);
    const selectedIndex = Number(answer.selected_index);
    if (!Number.isInteger(questionId) || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3 || answerMap.has(questionId)) {
      return res.status(400).json({ error: "Answers check karke dobara submit karein." });
    }
    answerMap.set(questionId, selectedIndex);
  }
  if (questions.some(function (question) { return !answerMap.has(question.id); })) {
    return res.status(400).json({ error: "Har sawal ka jawab dein." });
  }
  const score = questions.filter(function (question) {
    return answerMap.get(question.id) === question.correct_index;
  }).length;
  const attempt = await db.prepare(
    "INSERT INTO quiz_attempts (quiz_id, user_id, score, total) VALUES (?, ?, ?, ?)"
  ).run(quiz.id, req.session.userId, score, questions.length);
  res.status(201).json({ id: attempt.lastInsertRowid, quiz_title: quiz.title, score, total: questions.length });
});

app.get("/api/quiz-attempts", async function (req, res) {
  const attempts = await db.prepare(`
    SELECT qa.id, qa.quiz_id, q.title AS quiz_title, qa.score, qa.total, qa.completed_at
    FROM quiz_attempts qa INNER JOIN quizzes q ON q.id = qa.quiz_id AND q.user_id = qa.user_id
    WHERE qa.user_id = ? ORDER BY qa.id DESC LIMIT 50
  `).all(req.session.userId);
  res.json(attempts);
});

app.delete("/api/quizzes/:id", async function (req, res) {
  const quiz = await db.prepare("SELECT id FROM quizzes WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!quiz) return res.status(404).json({ error: "Quiz nahi mila." });
  const removeQuiz = db.transaction(async function () {
    await db.prepare("DELETE FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?").run(quiz.id, req.session.userId);
    await db.prepare("DELETE FROM quiz_questions WHERE quiz_id = ? AND user_id = ?").run(quiz.id, req.session.userId);
    await db.prepare("DELETE FROM quizzes WHERE id = ? AND user_id = ?").run(quiz.id, req.session.userId);
  });
  await removeQuiz();
  res.json({ message: "Deleted" });
});

// ---------- Reminders ----------
const reminderKinds = ["Assignment", "Class", "Study session"];

app.get("/api/reminders", async function (req, res) {
  const reminders = await db.prepare(
    "SELECT id, title, kind, remind_at, notified_at, is_done FROM reminders WHERE user_id = ? ORDER BY is_done, remind_at"
  ).all(req.session.userId);
  res.json(reminders);
});

app.post("/api/reminders", async function (req, res) {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const kind = typeof req.body.kind === "string" ? req.body.kind : "";
  const remindAt = typeof req.body.remind_at === "string" ? req.body.remind_at : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(remindAt);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) : null;
  const validDate = date && date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3]) && date.getHours() === Number(match[4]) && date.getMinutes() === Number(match[5]);
  if (!title || title.length > 100) return res.status(400).json({ error: "Reminder ka title likhein (maximum 100 characters)." });
  if (!reminderKinds.includes(kind)) return res.status(400).json({ error: "Reminder ki category select karein." });
  if (!validDate || date.getTime() <= Date.now()) return res.status(400).json({ error: "Reminder ka future date aur time select karein." });
  const result = await db.prepare(
    "INSERT INTO reminders (user_id, title, kind, remind_at) VALUES (?, ?, ?, ?)"
  ).run(req.session.userId, title, kind, remindAt);
  res.status(201).json({ id: result.lastInsertRowid, title, kind, remind_at: remindAt, notified_at: "", is_done: 0 });
});

app.put("/api/reminders/:id", async function (req, res) {
  const reminder = await db.prepare("SELECT id FROM reminders WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!reminder) return res.status(404).json({ error: "Reminder nahi mila." });
  const done = req.body.is_done === true || req.body.is_done === 1 ? 1 : 0;
  await db.prepare("UPDATE reminders SET is_done = ? WHERE id = ? AND user_id = ?")
    .run(done, reminder.id, req.session.userId);
  res.json({ message: "Updated" });
});

app.post("/api/reminders/:id/notified", async function (req, res) {
  const result = await db.prepare(
    "UPDATE reminders SET notified_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND notified_at = ''"
  ).run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Reminder nahi mila ya pehle notify ho chuka." });
  res.json({ message: "Notified" });
});

app.delete("/api/reminders/:id", async function (req, res) {
  const result = await db.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Reminder nahi mila." });
  res.json({ message: "Deleted" });
});

// ---------- Grade tracker ----------
app.get("/api/grades", async function (req, res) {
  const entries = await db.prepare(
    "SELECT id, subject, assessment, score, total, created_at FROM grade_entries WHERE user_id = ? ORDER BY id DESC"
  ).all(req.session.userId);
  const targets = await db.prepare(
    "SELECT subject, target_percent FROM grade_targets WHERE user_id = ? ORDER BY subject COLLATE NOCASE"
  ).all(req.session.userId);
  res.json({ entries, targets });
});

app.post("/api/grades", async function (req, res) {
  const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
  const assessment = typeof req.body.assessment === "string" ? req.body.assessment.trim() : "";
  const score = Number(req.body.score);
  const total = Number(req.body.total);
  const target = Number(req.body.target_percent);
  if (!subject || subject.length > 50) return res.status(400).json({ error: "Subject likhein (maximum 50 characters)." });
  if (!assessment || assessment.length > 100) return res.status(400).json({ error: "Test ya assessment ka naam likhein." });
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0 || score < 0 || score > total) {
    return res.status(400).json({ error: "Marks check karein: score zero se total marks tak ho." });
  }
  if (!Number.isFinite(target) || target < 0 || target > 100) return res.status(400).json({ error: "Target 0 se 100 percent ke darmiyan ho." });
  const saveGrade = db.transaction(async function () {
    const entry = await db.prepare(
      "INSERT INTO grade_entries (user_id, subject, assessment, score, total) VALUES (?, ?, ?, ?, ?)"
    ).run(req.session.userId, subject, assessment, score, total);
    await db.prepare(`INSERT INTO grade_targets (user_id, subject, target_percent) VALUES (?, ?, ?)
      ON CONFLICT(user_id, subject) DO UPDATE SET target_percent = excluded.target_percent`)
      .run(req.session.userId, subject, target);
    return entry.lastInsertRowid;
  });
  const id = await saveGrade();
  res.status(201).json({ id, subject, assessment, score, total, target_percent: target });
});

app.delete("/api/grades/:id", async function (req, res) {
  const result = await db.prepare("DELETE FROM grade_entries WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Grade entry nahi mili." });
  res.json({ message: "Deleted" });
});

// ---------- Class timetable ----------
function parseClassInput(body) {
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const day = Number(body.day_of_week);
  const start = typeof body.start_time === "string" ? body.start_time : "";
  const end = typeof body.end_time === "string" ? body.end_time : "";
  const room = typeof body.room === "string" ? body.room.trim() : "";
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!subject || subject.length > 60) return { error: "Subject likhein (maximum 60 characters)." };
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Class ka din select karein." };
  if (!timePattern.test(start) || !timePattern.test(end) || start >= end) return { error: "End time, start time ke baad hona chahiye." };
  if (room.length > 50) return { error: "Room 50 characters se chhota hona chahiye." };
  return { value: { subject, day, start, end, room } };
}

async function classTimeConflict(userId, item, excludedId) {
  let query = `SELECT id FROM classes WHERE user_id = ? AND day_of_week = ?
    AND start_time < ? AND end_time > ?`;
  const params = [userId, item.day, item.end, item.start];
  if (excludedId !== undefined) {
    query += " AND id <> ?";
    params.push(excludedId);
  }
  return Boolean(await db.prepare(query).get(...params));
}

app.get("/api/classes", async function (req, res) {
  const schedule = await db.prepare(
    "SELECT id, subject, day_of_week, start_time, end_time, room FROM classes WHERE user_id = ? ORDER BY day_of_week, start_time"
  ).all(req.session.userId);
  res.json(schedule);
});

app.post("/api/classes", async function (req, res) {
  const parsed = parseClassInput(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (await classTimeConflict(req.session.userId, parsed.value)) return res.status(409).json({ error: "Us din aur waqt par pehle se class hai." });
  const item = parsed.value;
  const result = await db.prepare(
    "INSERT INTO classes (user_id, subject, day_of_week, start_time, end_time, room) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(req.session.userId, item.subject, item.day, item.start, item.end, item.room);
  res.status(201).json({ id: result.lastInsertRowid, subject: item.subject, day_of_week: item.day, start_time: item.start, end_time: item.end, room: item.room });
});

app.put("/api/classes/:id", async function (req, res) {
  const existing = await db.prepare("SELECT id FROM classes WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: "Class nahi mili." });
  const parsed = parseClassInput(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (await classTimeConflict(req.session.userId, parsed.value, req.params.id)) return res.status(409).json({ error: "Us din aur waqt par pehle se class hai." });
  const item = parsed.value;
  await db.prepare("UPDATE classes SET subject = ?, day_of_week = ?, start_time = ?, end_time = ?, room = ? WHERE id = ? AND user_id = ?")
    .run(item.subject, item.day, item.start, item.end, item.room, req.params.id, req.session.userId);
  res.json({ message: "Updated" });
});

app.delete("/api/classes/:id", async function (req, res) {
  const result = await db.prepare("DELETE FROM classes WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Class nahi mili." });
  res.json({ message: "Deleted" });
});

// ---------- Study analytics ----------
app.get("/api/analytics", async function (req, res) {
  const focusRows = await db.prepare(`
    SELECT date(completed_at, 'localtime') AS day, SUM(minutes) AS minutes
    FROM focus_sessions WHERE user_id = ? AND date(completed_at, 'localtime') >= date('now', 'localtime', '-365 days')
    GROUP BY date(completed_at, 'localtime')
  `).all(req.session.userId);
  const taskRows = await db.prepare(`
    SELECT date(completed_at, 'localtime') AS day, COUNT(*) AS count
    FROM tasks WHERE user_id = ? AND done = 1 AND completed_at <> ''
      AND date(completed_at, 'localtime') >= date('now', 'localtime', '-365 days')
    GROUP BY date(completed_at, 'localtime')
  `).all(req.session.userId);
  const focusByDay = new Map(focusRows.map(function (row) { return [row.day, Number(row.minutes) || 0]; }));
  const tasksByDay = new Map(taskRows.map(function (row) { return [row.day, Number(row.count) || 0]; }));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daily = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    const key = day.getFullYear() + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0");
    daily.push({ date: key, focus_minutes: focusByDay.get(key) || 0, tasks_completed: tasksByDay.get(key) || 0 });
  }
  const todayKey = daily[daily.length - 1].date;
  const weekFocus = daily.reduce(function (sum, day) { return sum + day.focus_minutes; }, 0);
  const weekTasks = daily.reduce(function (sum, day) { return sum + day.tasks_completed; }, 0);
  const activityDays = new Set([...focusRows.map(function (row) { return row.day; }), ...taskRows.map(function (row) { return row.day; })]);
  const streakCursor = new Date(today);
  if (!activityDays.has(todayKey)) streakCursor.setDate(streakCursor.getDate() - 1);
  let streakDays = 0;
  for (let count = 0; count < 366; count += 1) {
    const key = streakCursor.getFullYear() + "-" + String(streakCursor.getMonth() + 1).padStart(2, "0") + "-" + String(streakCursor.getDate()).padStart(2, "0");
    if (!activityDays.has(key)) break;
    streakDays += 1;
    streakCursor.setDate(streakCursor.getDate() - 1);
  }
  res.json({
    today_focus_minutes: focusByDay.get(todayKey) || 0,
    week_focus_minutes: weekFocus,
    week_tasks_completed: weekTasks,
    streak_days: streakDays,
    daily: daily
  });
});

app.post("/api/analytics/focus", async function (req, res) {
  const minutes = Number(req.body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    return res.status(400).json({ error: "Focus session duration invalid hai." });
  }
  const result = await db.prepare("INSERT INTO focus_sessions (user_id, minutes) VALUES (?, ?)")
    .run(req.session.userId, minutes);
  res.status(201).json({ id: result.lastInsertRowid, minutes: minutes });
});

// ---------- Tasks ----------
app.get("/api/tasks", async function (req, res) {
  const tasks = await db
    .prepare(
      `SELECT * FROM tasks WHERE user_id = ?
       ORDER BY done ASC,
         CASE priority WHEN 'High' THEN 0 WHEN 'Normal' THEN 1 ELSE 2 END,
         CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, id DESC`
    )
    .all(req.session.userId);
  res.json(tasks);
});

app.post("/api/tasks", async function (req, res) {
  const text = (req.body.text || "").trim();
  const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
  const priority = req.body.priority || "Normal";
  const recurrence = req.body.recurrence || "none";
  let dueDate = (req.body.due_date || "").trim();

  if (text === "") {
    return res.status(400).json({ error: "Task text is required" });
  }
  if (subject.length > 40) {
    return res.status(400).json({ error: "Task subject must be 40 characters or fewer" });
  }
  if (!["Low", "Normal", "High"].includes(priority)) {
    return res.status(400).json({ error: "Invalid task priority" });
  }
  if (!["none", "daily", "weekly"].includes(recurrence)) {
    return res.status(400).json({ error: "Invalid repeat schedule" });
  }
  if (recurrence !== "none" && !dueDate) {
    const today = new Date();
    dueDate = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  }

  const info = await db
    .prepare("INSERT INTO tasks (text, user_id, priority, due_date, subject, recurrence) VALUES (?, ?, ?, ?, ?, ?)")
    .run(text, req.session.userId, priority, dueDate, subject, recurrence);
  if (recurrence !== "none") {
    await db.prepare("UPDATE tasks SET series_id = ? WHERE id = ? AND user_id = ?")
      .run(info.lastInsertRowid, info.lastInsertRowid, req.session.userId);
  }
  res.status(201).json({
    id: info.lastInsertRowid,
    text: text,
    done: 0,
    priority: priority,
    due_date: dueDate,
    subject: subject,
    recurrence: recurrence
  });
});

app.put("/api/tasks/:id", async function (req, res) {
  if (req.body && (req.body.text !== undefined || req.body.priority !== undefined || req.body.due_date !== undefined || req.body.subject !== undefined || req.body.recurrence !== undefined)) {
    const current = await db
      .prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.session.userId);
    if (!current) {
      return res.status(404).json({ error: "Task not found" });
    }

    const text = typeof req.body.text === "string" ? req.body.text.trim() : current.text;
    const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : current.subject || "";
    const priority = req.body.priority || current.priority || "Normal";
    const dueDate = typeof req.body.due_date === "string" ? req.body.due_date.trim() : current.due_date || "";
    const recurrence = typeof req.body.recurrence === "string" ? req.body.recurrence : current.recurrence || "none";
    if (text === "") {
      return res.status(400).json({ error: "Task text is required" });
    }
    if (subject.length > 40) {
      return res.status(400).json({ error: "Task subject must be 40 characters or fewer" });
    }
    if (!["Low", "Normal", "High"].includes(priority)) {
      return res.status(400).json({ error: "Invalid task priority" });
    }
    if (!["none", "daily", "weekly"].includes(recurrence)) {
      return res.status(400).json({ error: "Invalid repeat schedule" });
    }
    let effectiveDueDate = dueDate;
    if (recurrence !== "none" && !effectiveDueDate) {
      const today = new Date();
      effectiveDueDate = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    }
    const seriesId = recurrence === "none" ? null : (current.series_id || current.id);

    await db.prepare(
      "UPDATE tasks SET text = ?, subject = ?, priority = ?, due_date = ?, recurrence = ?, series_id = ? WHERE id = ? AND user_id = ?"
    ).run(text, subject, priority, effectiveDueDate, recurrence, seriesId, req.params.id, req.session.userId);
    return res.json({ message: "Updated" });
  }

  const task = await db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const recurrence = task.recurrence || "none";
  if (task.done && recurrence !== "none") {
    return res.status(400).json({ error: "Completed repeat tasks stay in history; delete it if it should not repeat again." });
  }
  if (!task.done && recurrence !== "none") {
    const nextDate = task.due_date ? new Date(task.due_date + "T00:00:00") : new Date();
    const interval = recurrence === "daily" ? 1 : 7;
    nextDate.setDate(nextDate.getDate() + interval);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    while (nextDate <= today) nextDate.setDate(nextDate.getDate() + interval);
    const nextDueDate = nextDate.getFullYear() + "-" + String(nextDate.getMonth() + 1).padStart(2, "0") + "-" + String(nextDate.getDate()).padStart(2, "0");
    const advanceTask = db.transaction(async function () {
      await db.prepare("UPDATE tasks SET done = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").run(task.id, req.session.userId);
      return await db.prepare(
        "INSERT INTO tasks (text, done, user_id, priority, due_date, subject, recurrence, series_id) VALUES (?, 0, ?, ?, ?, ?, ?, ?)"
      ).run(task.text, req.session.userId, task.priority || "Normal", nextDueDate, task.subject || "", recurrence, task.series_id || task.id);
    });
    const nextTask = await advanceTask();
    return res.json({ message: "Repeated", next_due_date: nextDueDate, next_id: nextTask.lastInsertRowid });
  }

  await db.prepare(task.done
    ? "UPDATE tasks SET done = 0, completed_at = '' WHERE id = ? AND user_id = ?"
    : "UPDATE tasks SET done = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.session.userId);
  res.json({ message: "Updated" });
});

app.delete("/api/tasks/:id", async function (req, res) {
  await db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Deleted" });
});

// ---------- Expenses ----------
app.get("/api/expenses", async function (req, res) {
  const expenses = await db
    .prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY id DESC")
    .all(req.session.userId);
  res.json(expenses);
});

app.post("/api/expenses", async function (req, res) {
  const title = (req.body.title || "").trim();
  const amount = Number(req.body.amount);
  const category = (req.body.category || "Other").trim();

  if (title === "" || !(amount > 0) || !["Food", "Transport", "Study", "Other"].includes(category)) {
    return res.status(400).json({ error: "Title and a valid amount are required" });
  }

  const info = await db
    .prepare(
      "INSERT INTO expenses (title, amount, category, user_id) VALUES (?, ?, ?, ?)"
    )
    .run(title, amount, category, req.session.userId);

  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/expenses/:id", async function (req, res) {
  const title = (req.body.title || "").trim();
  const amount = Number(req.body.amount);
  const category = (req.body.category || "").trim();
  if (title === "" || !(amount > 0) || !["Food", "Transport", "Study", "Other"].includes(category)) {
    return res.status(400).json({ error: "Enter a title, valid amount, and category" });
  }

  const info = await db.prepare(
    "UPDATE expenses SET title = ?, amount = ?, category = ? WHERE id = ? AND user_id = ?"
  ).run(title, amount, category, req.params.id, req.session.userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: "Expense not found" });
  }
  res.json({ message: "Updated" });
});

app.delete("/api/expenses/:id", async function (req, res) {
  await db.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Deleted" });
});

// ---------- Notes ----------
app.get("/api/notes", async function (req, res) {
  const notes = await db
    .prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, id DESC")
    .all(req.session.userId);
  res.json(notes);
});

app.post("/api/notes", async function (req, res) {
  const title = (req.body.title || "").trim();
  const content = (req.body.content || "").trim();

  if (title === "") {
    return res.status(400).json({ error: "Title is required" });
  }

  const info = await db
    .prepare("INSERT INTO notes (title, content, user_id) VALUES (?, ?, ?)")
    .run(title, content, req.session.userId);

  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/notes/:id", async function (req, res) {
  const title = (req.body.title || "").trim();
  const content = (req.body.content || "").trim();

  if (title === "") {
    return res.status(400).json({ error: "Title is required" });
  }

  const current = await db
    .prepare("SELECT pinned FROM notes WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!current) {
    return res.status(404).json({ error: "Note not found" });
  }
  const pinned = req.body.pinned === undefined ? current.pinned : Number(req.body.pinned);
  if (pinned !== 0 && pinned !== 1) {
    return res.status(400).json({ error: "Invalid pinned value" });
  }

  const info = await db
    .prepare(
      "UPDATE notes SET title = ?, content = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    )
    .run(title, content, pinned, req.params.id, req.session.userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.json({ message: "Updated" });
});

app.delete("/api/notes/:id", async function (req, res) {
  await db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Deleted" });
});

// ---------- Assignments ----------
if (!usePostgres) {
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
}

const allowedStatus = ["Not started", "In progress", "Submitted"];

app.use("/api/assignments", requireLogin);

app.get("/api/assignments", async function (req, res) {
  const items = await db
    .prepare(
      `SELECT * FROM assignments
       WHERE user_id = ?
       ORDER BY CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, id DESC`
    )
    .all(req.session.userId);
  res.json(items);
});

app.post("/api/assignments", async function (req, res) {
  const subject = (req.body.subject || "").trim();
  const title = (req.body.title || "").trim();
  const dueDate = (req.body.due_date || "").trim();

  if (subject === "" || title === "") {
    return res.status(400).json({ error: "Subject and title are required" });
  }

  const info = await db
    .prepare(
      "INSERT INTO assignments (user_id, subject, title, due_date) VALUES (?, ?, ?, ?)"
    )
    .run(req.session.userId, subject, title, dueDate);

  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/assignments/:id", async function (req, res) {
  const current = await db
    .prepare("SELECT * FROM assignments WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);

  if (!current) {
    return res.status(404).json({ error: "Assignment not found" });
  }

  const subject = typeof req.body.subject === "string"
    ? req.body.subject.trim()
    : current.subject;
  const title = typeof req.body.title === "string"
    ? req.body.title.trim()
    : current.title;
  const dueDate = typeof req.body.due_date === "string"
    ? req.body.due_date.trim()
    : current.due_date;
  const status = req.body.status || current.status;
  const marks = req.body.marks === undefined
    ? current.marks
    : String(req.body.marks).trim();

  if (subject === "" || title === "") {
    return res.status(400).json({ error: "Subject and title are required" });
  }
  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const info = await db
    .prepare(
      `UPDATE assignments
       SET subject = ?, title = ?, due_date = ?, status = ?, marks = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(subject, title, dueDate, status, marks, req.params.id, req.session.userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: "Assignment not found" });
  }

  res.json({ message: "Updated" });
});

app.delete("/api/assignments/:id", async function (req, res) {
  await db.prepare("DELETE FROM assignments WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId
  );
  res.json({ message: "Deleted" });
});

// ---------- Budgets ----------
if (!usePostgres) {
db.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    UNIQUE(user_id, category)
  )
`);
}

const budgetCategories = ["Food", "Transport", "Study", "Other"];

app.use("/api/budgets", requireLogin);

// Budget and this month's spending for every category
app.get("/api/budgets", async function (req, res) {
  const budgets = await db
    .prepare("SELECT category, amount FROM budgets WHERE user_id = ?")
    .all(req.session.userId);

  const spent = await db
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
app.put("/api/budgets/:category", async function (req, res) {
  const category = req.params.category;
  const amount = Number(req.body.amount);

  if (!budgetCategories.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  if (!(amount >= 0)) {
    return res.status(400).json({ error: "Please enter a valid amount" });
  }

  if (amount === 0) {
    await db.prepare("DELETE FROM budgets WHERE user_id = ? AND category = ?").run(
      req.session.userId,
      category
    );
  } else {
    await db.prepare(
      `INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)
       ON CONFLICT(user_id, category) DO UPDATE SET amount = excluded.amount`
    ).run(req.session.userId, category, amount);
  }

  res.json({ message: "Saved" });
});

// ---------- Server start ----------
databaseReady.then(function () {
  app.listen(PORT, "0.0.0.0", function () {
    console.log("Server running on port " + PORT);
  });
}).catch(function (error) {
  console.error("Database setup failed:", error.message);
  if (postgresPool) postgresPool.end();
  process.exitCode = 1;
});
