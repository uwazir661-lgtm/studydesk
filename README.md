# StudyDesk

StudyDesk is a personal study organizer built with Node.js, Express, SQLite, and browser JavaScript. It includes user accounts, tasks with daily or weekly repeats, browser reminders, grade tracking, a class timetable, study analytics, assignments, exam countdowns, a syllabus tracker, flashcards, practice quizzes with score history, a weekly study plan, a study calendar, Pomodoro timer, notes, expenses, monthly budgets, weather, and an optional AI study helper.

## Requirements

- Node.js 20.12 or newer
- npm (included with Node.js)

## Run on Windows

Open PowerShell in the StudyDesk folder, then install the packages:

```powershell
npm.cmd install
```

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace `SESSION_SECRET` with a long, random value. You can generate one in PowerShell with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the printed value into `.env`. Keep `.env` private; it contains server secrets. The included `.env.example` is safe to share.

Start StudyDesk:

```powershell
npm.cmd start
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Keep the terminal window open while you use the app. In PowerShell, `npm.cmd` avoids the script-policy error sometimes shown by `npm`.

## Optional AI helper

The study helper works in offline mode by default and does not need an API key. To enable OpenAI responses, set these values in `.env`:

```env
OPENAI_API_ENABLED=true
OPENAI_API_KEY=your_secret_api_key
OPENAI_MODEL=gpt-6-luna
```

The OpenAI API key belongs only in `.env` on the server. Never put it in files under `public/` or commit it to Git. API access may require available billing or credits. Set `OPENAI_API_ENABLED=false` to return to offline mode.

## Deploy

Use a host that supports Node.js 20.12 or newer and lets you configure environment variables. Set `NODE_ENV=production` and a strong `SESSION_SECRET`; the server will stop during startup if the production secret is missing. The host normally supplies `PORT` automatically.

For cloud hosting, set `DATABASE_URL` to a PostgreSQL connection string. StudyDesk creates its tables at startup and uses PostgreSQL whenever this variable is present. If it is absent, the app uses `DB_PATH` (SQLite), which is intended for local development or a host with a persistent disk. The existing local SQLite database is not automatically uploaded or copied to PostgreSQL; back it up separately if you need its records. The `/healthz` endpoint reports whether the web server is ready.

Typical deployment commands:

- Install: `npm install`
- Start: `npm start`

## Data and privacy

Passwords are stored as bcrypt hashes. API routes require a signed-in session and user records are kept separate. Study data is sent to the OpenAI API only when a user sends a message to the AI helper and AI mode is enabled. Weather lookup uses the third-party Open-Meteo service.

The browser keeps a per-account backup of tasks and notes for read-only use when the server is unreachable. It is stored in that browser's local storage and removed when the user logs out. Offline editing and syncing are not enabled.

## Project structure

```text
public/       Browser UI, styles, and feature scripts
server.js     Express API, sessions, and SQLite setup
.env.example  Safe template for local/server configuration
studydesk.db  Local SQLite database (ignored by Git)
```
