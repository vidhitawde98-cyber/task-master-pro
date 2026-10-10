# Task Master Pro (Student Task Manager)

Full stack task manager: React + Vite + Tailwind (client) and Node.js + Express + MongoDB (server) with JWT login.

## Folders
- `server/`               Express REST API + MongoDB
- `client/vite-project/`  React frontend

## Run on your computer (needs Node.js LTS and MongoDB running locally)

### 1. Server
1. Inside `server`, copy `.env.example` to `.env` (or copy your old `.env` file into this folder).
2. Open a terminal in the `server` folder and run:

       npm install
       npm run dev

   You should see "Connected to MongoDB".

### 2. Client (open a second terminal)
       cd client/vite-project
       npm install
       npm run dev

Open http://localhost:5173

Sample login - vidhitawde0@gmail.com
password - 12345678

## How things are calculated
- **Monthly report:** counts tasks created or completed in that month. Deleted tasks never count.
  For the current month it also counts every task that is still open, so it matches your task list.
  The Reports tab lists exactly which tasks were counted. "Streak days" = longest run of consecutive days with a completed task in that month.
- **XP:** +10 per task, +30 for high priority. Un-ticking a task takes the XP back.
- **Streak:** goes up by 1 each day you complete at least one task, and restarts after a missed day.
- **Sorting:** the Tasks tab can sort by newest, oldest, due date, or priority (remembered between visits).
  In the "All" view, finished tasks always sink to the bottom.
- **Delete:** removing a task shows an "Undo" pop-up for a few seconds. Deleting is a soft delete on
  the server, so Undo restores the exact same task (including its XP, if it was completed).
- **Due date labels:** "Due today", "Due tomorrow", or "Overdue by N days" instead of a plain date.
- The browser sends its timezone, so "today" and "this month" match your local time.
- The server will not start without `MONGO_URI` and `JWT_SECRET` in `server/.env`.
- Login and signup are rate-limited (20 failed logins / 50 signups per IP, by default) to slow down
  password guessing and spam signups. Adjust with `AUTH_RATE_LIMIT_MAX` / `SIGNUP_RATE_LIMIT_MAX` if needed.

## API endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/auth/signup | Register |
| POST | /api/auth/login | Login (returns JWT) |
| GET | /api/auth/me | Current user |
| GET | /api/tasks | List tasks |
| POST | /api/tasks | Create task |
| PUT | /api/tasks/:id | Toggle complete |
| PATCH | /api/tasks/:id | Edit title / priority / due date |
| DELETE | /api/tasks/:id | Delete task (soft delete) |
| POST | /api/tasks/:id/restore | Undo a delete |
| GET | /api/tasks/calendar/:year/:month | Tasks for a month |
| POST | /api/reports/generate | Generate monthly report |
| GET | /api/reports/:year/:month | Monthly report (always recalculated) |
| GET | /api/reports/detailed/:year/:month | Detailed report data |
| POST | /api/user/boss-reward | Save Battle Mode boss XP |

## Deploying online

You need three free services: a database (MongoDB Atlas), a backend host (Render), and a frontend
host (Netlify). Do them in this order, since each step needs the address from the one before it.

### 1. Database — MongoDB Atlas
1. Go to mongodb.com/cloud/atlas and create a free account, then create a free (M0) cluster.
2. Under **Database Access**, add a database user with a username and password (save them).
3. Under **Network Access**, click **Add IP Address** → **Allow access from anywhere** (0.0.0.0/0).
   This is fine for a student project; Render's servers don't have a fixed address.
4. Click **Connect** on your cluster → **Drivers** → copy the connection string. It looks like
   `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/`. Replace `<username>` and
   `<password>` with your real ones, and add a database name before the `?`, e.g.
   `.../student-task-manager?retryWrites=true`.

### 2. Backend — Render
1. Push this project to GitHub first (see below).
2. Go to render.com, sign in with GitHub, click **New → Web Service**, and pick your repository.
3. Set:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Under **Environment**, add:
   - `MONGO_URI` = the connection string from step 1
   - `JWT_SECRET` = any long random text (e.g. generate one at random.org)
5. Click **Create Web Service**. Wait for the deploy to finish, then open the service URL
   (e.g. `https://student-task-manager-api.onrender.com`) — it should show
   `{"status":"Student Task Manager API is running"}`.
6. **Free-tier note:** the server "sleeps" after 15 minutes of no traffic and takes up to ~30
   seconds to wake back up on the next request. The login/signup screen already shows a
   "please wait" message for this.

### 3. Frontend — Netlify
1. Go to app.netlify.com, sign in with GitHub, click **Add new site → Import an existing project**,
   and pick your repository.
2. Set:
   - **Base directory:** `client/vite-project`
   - **Build command:** `npm run build`
   - **Publish directory:** `client/vite-project/dist`
3. Under **Environment variables**, add `VITE_API_URL` = your Render URL from step 2
   (no trailing slash).
4. Click **Deploy**. Netlify gives you a link ending in `.netlify.app` — that's your live site.

### 4. Connect them (recommended)
Go back to Render → your service → **Environment**, and add:
- `CLIENT_URL` = your Netlify URL (e.g. `https://your-site.netlify.app`)

This makes the API only answer requests from your website, which is safer than leaving it open to
any site. After adding it, Render will redeploy automatically.

### Pushing to GitHub
Never upload `.env` files — `.gitignore` already excludes them. From this folder:

    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin https://github.com/<your-username>/<your-repo>.git
    git push -u origin main
