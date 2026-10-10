import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// Fail fast with a clear message instead of running with an insecure default secret.
if (!MONGO_URI || !JWT_SECRET) {
  console.error("❌ Missing MONGO_URI or JWT_SECRET. Copy server/.env.example to server/.env and fill in both values (on Render, add them under Environment).");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // on Render the real visitor IP arrives via one proxy

// CLIENT_URL (optional): the website address(es) allowed to call this API, comma separated.
// Leave it empty while developing; set it on the live server, e.g. https://my-tasks.netlify.app
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map(o => o.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
app.use(express.json());

// Slow down password guessing and account spam.
const tooMany = { error: "Too many attempts. Please wait a few minutes and try again." };
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20, // failed logins per IP per 15 minutes
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: parseInt(process.env.SIGNUP_RATE_LIMIT_MAX, 10) || 50, // sign-ups per IP per hour (a whole class may share one IP)
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany
});
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/signup", signupLimiter);

// Health check (used by hosting platforms and for quick testing)
app.get("/", (req, res) => res.json({ status: "Student Task Manager API is running" }));

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ---------- Game rules (kept on the server so users cannot fake them) ----------
const PRIORITIES = ["low", "medium", "high"];
const xpFor = (priority) => (priority === "high" ? 30 : 10);
const levelFor = (xp) => Math.floor(xp / 100) + 1;
const BOSS_REWARDS = [50, 75, 100, 150, 200]; // Procrastination Dragon ... Ultimate Productivity Boss
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Schemas ----------
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  streak: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  done: { type: Boolean, default: false },
  priority: { type: String, enum: PRIORITIES, default: "medium" },
  dueDate: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  xpAwarded: { type: Number, default: 0 }, // XP given when completed (so un-completing can take it back)
  deleted: { type: Boolean, default: false }, // soft delete
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
taskSchema.index({ userId: 1, deleted: 1, createdAt: -1 });
const Task = mongoose.model("Task", taskSchema);

const reportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  totalTasks: { type: Number, default: 0 },
  completedTasks: { type: Number, default: 0 },
  highPriorityCompleted: { type: Number, default: 0 },
  xpEarned: { type: Number, default: 0 },
  streakDays: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
reportSchema.index({ userId: 1, year: 1, month: 1 });
const Report = mongoose.model("Report", reportSchema);

// ---------- Helpers ----------
// The browser sends its timezone offset (minutes, e.g. -330 for India) so "today" and
// "this month" match what the user sees, even when the server runs in UTC (Render).
function getTz(req) {
  const n = parseInt(req.headers["x-tz-offset"], 10);
  return Number.isFinite(n) && Math.abs(n) <= 840 ? n : 0;
}

// Calendar day (YYYY-MM-DD) of a date in the user's timezone.
function dayKey(date, tz) {
  return new Date(new Date(date).getTime() - tz * 60000).toISOString().slice(0, 10);
}

// [start, end) of a month in the user's timezone.
function monthRange(year, month, tz) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1) + tz * 60000),
    end: new Date(Date.UTC(year, month, 1) + tz * 60000)
  };
}

// Due dates are saved as YYYY-MM-DD (midnight UTC). A task is only late after the WHOLE due day ends.
function endOfDueDay(dueDate, tz) {
  const d = new Date(dueDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + tz * 60000);
}

function parseYearMonth(yearRaw, monthRaw) {
  const year = parseInt(yearRaw, 10);
  const month = parseInt(monthRaw, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDueDate(value) {
  if (value === undefined || value === null || value === "") return { ok: true, date: null };
  const d = new Date(value);
  return isNaN(d.getTime()) ? { ok: false } : { ok: true, date: d };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Emails are stored lowercase; the fallback lets older accounts saved with capitals still log in.
async function findUserByEmail(email) {
  return (await User.findOne({ email })) ||
    (await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") }));
}

function daysSinceActive(user, tz) {
  return Math.round((Date.parse(dayKey(new Date(), tz)) - Date.parse(dayKey(user.lastActive, tz))) / DAY_MS);
}

// If the last completed task was before yesterday, the streak is broken.
function effectiveStreak(user, tz) {
  return daysSinceActive(user, tz) <= 1 ? user.streak : 0;
}

// Called when a task is completed.
function bumpStreak(user, tz) {
  const diff = daysSinceActive(user, tz);
  if (user.streak === 0 || diff > 1 || diff < 0) user.streak = 1; // first completion, or streak was broken
  else if (diff === 1) user.streak += 1; // consecutive day
  // diff === 0 -> already completed something today, streak unchanged
  user.lastActive = new Date();
}

function publicUser(user, tz) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    xp: user.xp,
    level: user.level,
    streak: effectiveStreak(user, tz)
  };
}

// Longest run of consecutive days with at least one completed task.
function longestStreak(completedDates, tz) {
  const days = [...new Set(completedDates.map(d => dayKey(d, tz)))].sort();
  let best = 0, run = 0, prev = null;
  for (const day of days) {
    run = prev && Date.parse(day) - Date.parse(prev) === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

// Which tasks belong to a month's report? Deleted tasks never count.
//  - tasks created in that month
//  - tasks completed in that month
//  - for the CURRENT month only: every task that is still open (so the report matches your task list)
function monthTaskFilter(userId, year, month, tz) {
  const { start, end } = monthRange(year, month, tz);
  const inMonth = (field) => ({ [field]: { $gte: start, $lt: end } });
  const isCurrentMonth = dayKey(new Date(), tz).slice(0, 7) === `${year}-${String(month).padStart(2, "0")}`;
  const belongs = [inMonth("createdAt"), inMonth("completedAt")];
  if (isCurrentMonth) belongs.push({ done: false });
  return { filter: { userId, deleted: false, $or: belongs }, start, end };
}

// Builds (and saves) the report for ONE month. It is recalculated every time, so it can never go stale.
async function buildReport(userId, year, month, tz) {
  const { filter, start, end } = monthTaskFilter(userId, year, month, tz);

  const completed = await Task.find({
    userId,
    deleted: false,
    completedAt: { $gte: start, $lt: end }
  }).select("priority completedAt");
  const totalTasks = await Task.countDocuments(filter);

  const highPriorityCompleted = completed.filter(t => t.priority === "high").length;
  const values = {
    totalTasks,
    completedTasks: completed.length,
    highPriorityCompleted,
    xpEarned: completed.length * 10 + highPriorityCompleted * 20,
    streakDays: longestStreak(completed.map(t => t.completedAt), tz)
  };

  return Report.findOneAndUpdate(
    { userId, month, year },
    { $set: values },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ---------- Auth middleware ----------
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.userId = user.userId;
    next();
  });
}

// ---------- AUTH ROUTES ----------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = cleanText(req.body.name);
    const email = cleanText(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (name.length > 60) {
      return res.status(400).json({ error: "Name is too long (max 60 characters)" });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (await findUserByEmail(email)) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user: publicUser(user, getTz(req)) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: "Email already registered" });
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = cleanText(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: publicUser(user, getTz(req)) });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(publicUser(user, getTz(req)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ---------- TASK ROUTES (Protected) ----------
app.get("/api/tasks", authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.userId, deleted: false }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

app.post("/api/tasks", authenticateToken, async (req, res) => {
  try {
    const title = cleanText(req.body.title);
    const priority = req.body.priority || "medium";
    const due = parseDueDate(req.body.dueDate);

    if (!title) return res.status(400).json({ error: "Task title is required" });
    if (title.length > 200) return res.status(400).json({ error: "Task title is too long (max 200 characters)" });
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: "Priority must be low, medium or high" });
    if (!due.ok) return res.status(400).json({ error: "Due date is not a valid date" });

    const newTask = new Task({ userId: req.userId, title, priority, dueDate: due.date });
    await newTask.save();
    res.status(201).json(newTask);
  } catch (error) {
    res.status(400).json({ error: "Failed to create task" });
  }
});

// Toggle task completion (gives / takes back XP and updates the streak)
app.put("/api/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId, deleted: false });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    task.done = !task.done;
    task.updatedAt = new Date();

    if (task.done) {
      const gain = xpFor(task.priority);
      task.completedAt = new Date();
      task.xpAwarded = gain;
      user.xp += gain;
      bumpStreak(user, getTz(req));
    } else {
      // Un-completing takes the XP back, so ticking/unticking cannot be used to farm XP.
      const refund = task.xpAwarded || xpFor(task.priority);
      task.completedAt = null;
      task.xpAwarded = 0;
      user.xp = Math.max(0, user.xp - refund);
    }
    user.level = levelFor(user.xp);

    await user.save();
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: "Failed to update task" });
  }
});

// Soft delete
app.delete("/api/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId, deleted: false });
    if (!task) return res.status(404).json({ error: "Task not found" });

    task.deleted = true;
    task.updatedAt = new Date();
    await task.save();

    res.json({ success: true, message: "Task deleted" });
  } catch (error) {
    res.status(400).json({ error: "Failed to delete task" });
  }
});

// Undo a delete
app.post("/api/tasks/:id/restore", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId, deleted: true });
    if (!task) return res.status(404).json({ error: "Task not found" });

    task.deleted = false;
    task.updatedAt = new Date();
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: "Failed to restore task" });
  }
});

// Edit task details (title, priority, due date)
app.patch("/api/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId, deleted: false });
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (req.body.title !== undefined) {
      const title = cleanText(req.body.title);
      if (!title) return res.status(400).json({ error: "Task title cannot be empty" });
      if (title.length > 200) return res.status(400).json({ error: "Task title is too long (max 200 characters)" });
      task.title = title;
    }
    if (req.body.priority !== undefined) {
      if (!PRIORITIES.includes(req.body.priority)) return res.status(400).json({ error: "Priority must be low, medium or high" });
      task.priority = req.body.priority;
    }
    if (req.body.dueDate !== undefined) {
      const due = parseDueDate(req.body.dueDate);
      if (!due.ok) return res.status(400).json({ error: "Due date is not a valid date" });
      task.dueDate = due.date;
    }
    task.updatedAt = new Date();

    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: "Failed to update task" });
  }
});

// ---------- CALENDAR ----------
app.get("/api/tasks/calendar/:year/:month", authenticateToken, async (req, res) => {
  try {
    const ym = parseYearMonth(req.params.year, req.params.month);
    if (!ym) return res.status(400).json({ error: "Invalid year or month" });
    const { start, end } = monthRange(ym.year, ym.month, getTz(req));

    const tasks = await Task.find({
      userId: req.userId,
      deleted: false,
      $or: [
        { dueDate: { $gte: start, $lt: end } },
        { completedAt: { $gte: start, $lt: end } }
      ]
    });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch calendar tasks" });
  }
});

// ---------- REPORTS ----------
app.post("/api/reports/generate", authenticateToken, async (req, res) => {
  try {
    const ym = parseYearMonth(req.body.year, req.body.month);
    if (!ym) return res.status(400).json({ error: "Invalid year or month" });

    const report = await buildReport(req.userId, ym.year, ym.month, getTz(req));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: "Failed to generate report" });
  }
});

app.get("/api/reports", authenticateToken, async (req, res) => {
  try {
    const reports = await Report.find({ userId: req.userId }).sort({ year: -1, month: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

app.get("/api/reports/detailed/:year/:month", authenticateToken, async (req, res) => {
  try {
    const ym = parseYearMonth(req.params.year, req.params.month);
    if (!ym) return res.status(400).json({ error: "Invalid year or month" });
    const tz = getTz(req);
    const report = await buildReport(req.userId, ym.year, ym.month, tz);

    const { filter } = monthTaskFilter(req.userId, ym.year, ym.month, tz);
    const tasks = await Task.find(filter).sort({ createdAt: -1 });

    const enrichedTasks = tasks.map(task => {
      const taskObj = task.toObject();

      if (taskObj.completedAt && taskObj.createdAt) {
        taskObj.timeToComplete = new Date(taskObj.completedAt) - new Date(taskObj.createdAt);
      }

      // Late = finished after the END of the due day (finishing on the due day is on time).
      if (taskObj.dueDate && taskObj.completedAt) {
        taskObj.overdue = new Date(taskObj.completedAt) >= endOfDueDay(taskObj.dueDate, tz);
      }

      if (taskObj.completedAt) {
        const days = taskObj.timeToComplete / DAY_MS;
        if (days < 1) taskObj.performance = "⚡ Lightning Fast";
        else if (days < 3) taskObj.performance = "🚀 Quick";
        else if (days < 7) taskObj.performance = "✅ Good";
        else taskObj.performance = "🐢 Took Time";

        if (taskObj.overdue) taskObj.performance = "⏰ Completed Late";
      }

      return taskObj;
    });

    const user = await User.findById(req.userId);
    res.json({ report, tasks: enrichedTasks, userName: user ? user.name : "" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate detailed report" });
  }
});

app.get("/api/reports/:year/:month", authenticateToken, async (req, res) => {
  try {
    const ym = parseYearMonth(req.params.year, req.params.month);
    if (!ym) return res.status(400).json({ error: "Invalid year or month" });

    const report = await buildReport(req.userId, ym.year, ym.month, getTz(req));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// ---------- BATTLE MODE ----------
// The reward amounts live on the server, so the client can only say WHICH boss was defeated.
app.post("/api/user/boss-reward", authenticateToken, async (req, res) => {
  try {
    const bossNumber = parseInt(req.body.bossIndex, 10);
    if (!Number.isInteger(bossNumber) || bossNumber < 1 || bossNumber > BOSS_REWARDS.length) {
      return res.status(400).json({ error: "Invalid boss" });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.xp += BOSS_REWARDS[bossNumber - 1];
    user.level = levelFor(user.xp);
    await user.save();
    res.json(publicUser(user, getTz(req)));
  } catch (error) {
    res.status(500).json({ error: "Failed to save boss reward" });
  }
});

// ---------- Unknown routes / bad JSON ----------
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON in request" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
