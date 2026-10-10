import { useEffect, useRef, useState } from "react";
import { 
  CheckCircle2, Circle, Trash2, Plus, Calendar as CalendarIcon, Clock, Search, X,
  Sparkles, Target, TrendingUp, Trophy, Zap, Play, Pause, RotateCcw, Flame,
  Smile, Coffee, Brain, Frown, Swords, LogOut, FileText, BarChart3
} from "lucide-react";

// Backend URL. Empty = same origin (local dev uses the Vite proxy to localhost:5000).
// For the live site, set VITE_API_URL to your deployed backend URL (see README).
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// ----- date helpers (due dates are saved as YYYY-MM-DD) -----
const DAY_MS = 24 * 60 * 60 * 1000;
function todayString() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
// Days from today until the due date (negative = overdue)
function daysUntil(dueDate) {
  return Math.round((Date.parse(new Date(dueDate).toISOString().slice(0, 10)) - Date.parse(todayString())) / DAY_MS);
}
function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const SORT_OPTIONS = ["newest", "oldest", "due", "priority"];

export default function App() {
  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  
  // Task States
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  
  // Gamification States
  const [userPoints, setUserPoints] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  
  // Pomodoro States
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerTask, setTimerTask] = useState(null);
  const [customDuration, setCustomDuration] = useState(25);
  const [showDurationSettings, setShowDurationSettings] = useState(false);

  // Mood States
  const [currentMood, setCurrentMood] = useState(null);
  const [showMoodSelector, setShowMoodSelector] = useState(true);
  const [onlyMoodMatches, setOnlyMoodMatches] = useState(false);

  // Sorting (remembered between visits) and pop-up messages
  const [sortBy, setSortBy] = useState(() => {
    try {
      const saved = localStorage.getItem("sortBy");
      return SORT_OPTIONS.includes(saved) ? saved : "newest";
    } catch {
      return "newest";
    }
  });
  const [toasts, setToasts] = useState([]);

  // Battle Mode States
  const [battleMode, setBattleMode] = useState(false);
  const [bossHP, setBossHP] = useState(100);
  const [playerHP, setPlayerHP] = useState(100);
  const [battleTasksCompleted, setBattleTasksCompleted] = useState(0);
  const [currentBoss, setCurrentBoss] = useState(1);
  const [totalBossesDefeated, setTotalBossesDefeated] = useState(0);

  // Reports & Tab States
  const [activeTab, setActiveTab] = useState("tasks");
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [reportTasks, setReportTasks] = useState([]);
  const reportRequestId = useRef(0); // lets us ignore late answers for a month the user already left
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Edit Task States
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', priority: '', dueDate: '' });
  
  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const moods = [
    { id: "energetic", name: "Energetic", icon: Zap, color: "from-yellow-400 to-orange-500", emoji: "⚡" },
    { id: "focused", name: "Focused", icon: Brain, color: "from-blue-400 to-purple-500", emoji: "🧠" },
    { id: "tired", name: "Tired", icon: Coffee, color: "from-gray-400 to-slate-500", emoji: "😴" },
    { id: "stressed", name: "Stressed", icon: Frown, color: "from-red-400 to-pink-500", emoji: "😰" },
    { id: "relaxed", name: "Relaxed", icon: Smile, color: "from-green-400 to-teal-500", emoji: "😊" }
  ];

  const bosses = [
    { name: "Procrastination Dragon", hp: 100, emoji: "🐉", reward: 50 },
    { name: "Distraction Demon", hp: 150, emoji: "👹", reward: 75 },
    { name: "Laziness Hydra", hp: 200, emoji: "🐍", reward: 100 },
    { name: "Chaos Titan", hp: 250, emoji: "⚡", reward: 150 },
    { name: "Ultimate Productivity Boss", hp: 300, emoji: "👑", reward: 200 }
  ];

  // Token management
  const getToken = () => localStorage.getItem('token');
  const setToken = (token) => localStorage.setItem('token', token);
  const removeToken = () => localStorage.removeItem('token');

  // API call with auth
  async function apiCall(url, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      'x-tz-offset': String(new Date().getTimezoneOffset()),
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };
    
    const response = await fetch(`${API_BASE}${url}`, { ...options, headers });
    
    if (response.status === 401 || response.status === 403) {
      handleLogout();
      throw new Error('Session expired');
    }
    
    return response;
  }

  // Small pop-up messages instead of alert(). They can carry an action button such as "Undo".
  function showToast(message, { actionLabel, onAction, duration = 4000 } = {}) {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, actionLabel, onAction }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }
  function dismissToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  // Show the server's own error message (e.g. "Task title is required") instead of a generic one
  async function readError(res, fallback) {
    try {
      const data = await res.json();
      return data.error || fallback;
    } catch {
      return fallback;
    }
  }

  // Auth Functions
  async function handleSignup() {
    try {
      setError("");

      // Validation
      if (!authForm.name.trim()) {
        setError("Name is required");
        return;
      }
      if (!authForm.email.trim()) {
        setError("Email is required");
        return;
      }
      if (!/\S+@\S+\.\S+/.test(authForm.email)) {
        setError("Please enter a valid email");
        return;
      }
      if (!authForm.password) {
        setError("Password is required");
        return;
      }
      if (authForm.password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tz-offset": String(new Date().getTimezoneOffset()) },
        body: JSON.stringify(authForm)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setToken(data.token);
      setCurrentUser(data.user);
      setIsAuthenticated(true);
      setUserPoints(data.user.xp);
      setUserLevel(data.user.level);
      setStreak(data.user.streak);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "Cannot reach the server. Please try again in a moment." : err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin() {
    try {
      setError("");

      // Validation
      if (!authForm.email.trim()) {
        setError("Email is required");
        return;
      }
      if (!authForm.password) {
        setError("Password is required");
        return;
      }

      setAuthLoading(true);
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tz-offset": String(new Date().getTimezoneOffset()) },
        body: JSON.stringify({ email: authForm.email, password: authForm.password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setToken(data.token);
      setCurrentUser(data.user);
      setIsAuthenticated(true);
      setUserPoints(data.user.xp);
      setUserLevel(data.user.level);
      setStreak(data.user.streak);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "Cannot reach the server. Please try again in a moment." : err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    removeToken();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setTasks([]);
    setUserPoints(0);
    setUserLevel(1);
    setStreak(0);
  }

  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (token) {
        try {
          const res = await apiCall("/api/auth/me");
          const user = await res.json();
          setCurrentUser(user);
          setIsAuthenticated(true);
          setUserPoints(user.xp);
          setUserLevel(user.level);
          setStreak(user.streak);
        } catch {
          removeToken();
        }
      }
    }
    checkAuth();
  }, []);

  // Load tasks when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadTasks();
    }
  }, [isAuthenticated]);

  // Load the report for the chosen month whenever the Reports tab is open or the month/year changes
  useEffect(() => {
    if (isAuthenticated && activeTab === "reports") {
      loadMonthlyReport();
    }
  }, [isAuthenticated, activeTab, selectedMonth, selectedYear]);

  async function loadMonthlyReport() {
    const requestId = ++reportRequestId.current;
    try {
      const res = await apiCall(`/api/reports/detailed/${selectedYear}/${selectedMonth}`);
      const data = await res.json();
      // If the user already picked another month, ignore this late answer
      if (requestId !== reportRequestId.current) return;
      if (data.report) {
        setMonthlyReport(data.report);
        setReportTasks(data.tasks || []);
      }
    } catch (err) {
      console.error("Failed to load report", err);
    }
  }

  async function generateReport() {
    try {
      await apiCall("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ month: selectedMonth, year: selectedYear })
      });
      await loadMonthlyReport();
      showToast("📊 Report generated successfully!");
    } catch {
      setError("Failed to generate report");
    }
  }

  async function downloadDetailedPDF() {
  try {
    const res = await apiCall(`/api/reports/detailed/${selectedYear}/${selectedMonth}`);
    const data = await res.json();
    generatePDF(data);
  } catch (err) {
    setError("Failed to generate detailed report: " + err.message);
  }
}

function formatDuration(ms) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function generatePDF(reportData) {
  const { report, tasks, userName } = reportData;
  
  const pdfContent = `<!DOCTYPE html>
<html><head><style>
body{font-family:Arial,sans-serif;padding:40px;background:#f5f5f5}
.container{max-width:900px;margin:0 auto;background:white;padding:40px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.header{text-align:center;border-bottom:4px solid #8b5cf6;padding-bottom:20px;margin-bottom:30px}
.header h1{color:#8b5cf6;margin:0;font-size:32px}
.header p{color:#666;margin:10px 0 0 0;font-size:18px}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin:30px 0}
.stat-card{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px;border-radius:10px;text-align:center}
.stat-card .number{font-size:36px;font-weight:bold;margin-bottom:5px}
.stat-card .label{font-size:14px;opacity:0.9}
.section{margin:40px 0}
.section-title{font-size:24px;color:#333;border-left:5px solid #8b5cf6;padding-left:15px;margin-bottom:20px}
.task-item{background:#f9fafb;border-left:4px solid #8b5cf6;padding:20px;margin:15px 0;border-radius:5px;page-break-inside:avoid}
.task-item.high{border-left-color:#ef4444}
.task-item.medium{border-left-color:#f59e0b}
.task-item.low{border-left-color:#10b981}
.task-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:15px}
.task-title{font-size:18px;font-weight:bold;color:#1f2937;flex:1}
.task-priority{padding:5px 15px;border-radius:20px;font-size:12px;font-weight:bold;text-transform:uppercase}
.priority-high{background:#fee2e2;color:#dc2626}
.priority-medium{background:#fef3c7;color:#d97706}
.priority-low{background:#d1fae5;color:#059669}
.task-details{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;font-size:14px;color:#666}
.task-detail{display:flex;align-items:center;gap:8px}
.task-detail strong{color:#333;min-width:120px}
.status-badge{padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold}
.status-completed{background:#d1fae5;color:#059669}
.status-overdue{background:#fee2e2;color:#dc2626}
.status-ontime{background:#dbeafe;color:#2563eb}
.insights{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;border-radius:10px;margin:30px 0}
.insights h3{margin:0 0 20px 0;font-size:22px}
.insights ul{list-style:none;padding:0;margin:0}
.insights li{padding:10px 0;font-size:16px;border-bottom:1px solid rgba(255,255,255,0.2)}
.insights li:last-child{border-bottom:none}
.footer{text-align:center;margin-top:50px;padding-top:30px;border-top:2px solid #e5e7eb;color:#666}
@media print{body{background:white}.container{box-shadow:none}}
</style></head><body><div class="container">
<div class="header">
<h1>📊 Detailed Monthly Report</h1>
<p><strong>${escapeHtml(userName)}</strong> - ${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
<p style="font-size:14px;color:#999">Generated on ${new Date().toLocaleString()}</p>
</div>
<div class="stats-grid">
<div class="stat-card"><div class="number">${report.totalTasks}</div><div class="label">Total Tasks</div></div>
<div class="stat-card"><div class="number">${report.completedTasks}</div><div class="label">Completed</div></div>
<div class="stat-card"><div class="number">${report.xpEarned}</div><div class="label">XP Earned</div></div>
<div class="stat-card"><div class="number">${report.streakDays}</div><div class="label">Day Streak</div></div>
</div>
<div class="insights"><h3>💡 Key Insights & Recommendations</h3><ul>
<li>✅ Completion Rate: <strong>${Math.round((report.completedTasks / report.totalTasks * 100) || 0)}%</strong></li>
<li>🎯 High Priority Tasks Completed: <strong>${report.highPriorityCompleted}</strong></li>
<li>🔥 Current Streak: <strong>${report.streakDays} days</strong> - Keep it going!</li>
${(report.completedTasks / report.totalTasks * 100) >= 80 ? '<li>🏆 Outstanding Performance!</li>' : '<li>💪 Room for improvement!</li>'}
${tasks.filter(t => t.timeToComplete && t.timeToComplete < 24 * 60 * 60 * 1000).length > 0 ? '<li>⚡ Great speed!</li>' : ''}
${tasks.filter(t => t.overdue).length > 0 ? `<li>⏰ ${tasks.filter(t => t.overdue).length} task(s) completed late.</li>` : '<li>✨ Perfect timing!</li>'}
</ul></div>
<div class="section"><h2 class="section-title">📋 Detailed Task Breakdown</h2>
${tasks.length === 0 ? '<div style="text-align:center;padding:40px">No tasks found</div>' :
  tasks.map(task => `<div class="task-item ${task.priority}">
<div class="task-header">
<div class="task-title">${escapeHtml(task.title)}</div>
<span class="task-priority priority-${task.priority}">${task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'} ${task.priority}</span>
</div>
<div class="task-details">
<div class="task-detail"><strong>Created:</strong><span>${new Date(task.createdAt).toLocaleString()}</span></div>
<div class="task-detail"><strong>Completed:</strong><span>${task.completedAt ? new Date(task.completedAt).toLocaleString() : 'Not completed'}</span></div>
<div class="task-detail"><strong>Due Date:</strong><span>${task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : 'No deadline'}</span></div>
<div class="task-detail"><strong>Status:</strong><span class="status-badge ${task.overdue ? 'status-overdue' : task.completedAt ? 'status-completed' : 'status-ontime'}">
${task.overdue ? '⏰ Late' : task.completedAt ? '✅ On Time' : '⏳ Progress'}</span></div>
<div class="task-detail"><strong>Time Taken:</strong><span>${task.timeToComplete ? formatDuration(task.timeToComplete) : 'N/A'}</span></div>
<div class="task-detail"><strong>Performance:</strong><span>${task.performance || 'N/A'}</span></div>
</div></div>`).join('')}
</div>
<div class="footer"><p><strong>Task Master Pro</strong></p></div>
</div></body></html>`;

  const blob = new Blob([pdfContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Task_Report_${userName}_${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' })}_${selectedYear}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast('📥 Report downloaded! Open the HTML file and use Print → Save as PDF', { duration: 8000 });
}

  async function loadTasks() {
    setLoading(true);
    setError("");
    try {
      const res = await apiCall("/api/tasks");
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      setError(err.message || "Error loading tasks");
    } finally {
      setLoading(false);
    }
  }

  function getTaskRecommendations() {
    if (!currentMood) return tasks.filter(t => !t.done);
    const activeTasks = tasks.filter(t => !t.done);
    const moodRecommendations = {
      energetic: activeTasks.filter(t => t.priority === "high"),
      focused: activeTasks.filter(t => t.priority === "medium" || t.priority === "high"),
      tired: activeTasks.filter(t => t.priority === "low"),
      stressed: activeTasks.filter(t => t.priority === "low" || t.priority === "medium"),
      relaxed: activeTasks
    };
    return moodRecommendations[currentMood.id] || activeTasks;
  }

  // Un-select the mood (used by the "Clear mood" buttons and by tapping the selected mood again)
  function clearMood() {
    setCurrentMood(null);
    setOnlyMoodMatches(false);
  }

  function getMoodAdvice() {
    if (!currentMood) return "";
    const advice = {
      energetic: "Perfect! Tackle those high-priority tasks while your energy is high! 💪",
      focused: "Great focus time! Work on important tasks that need concentration. 🎯",
      tired: "Take it easy. Focus on simple, low-priority tasks. Consider a break soon. ☕",
      stressed: "Deep breaths! Start with easier tasks to build momentum. You've got this! 🌟",
      relaxed: "Nice vibe! Good time for any task. Enjoy the flow! 😊"
    };
    return advice[currentMood.id] || "";
  }

  async function addTask() {
    if (!newTask.trim()) return;
    if (newTask.trim().length > 200) {
      setError("Task title is too long (max 200 characters)");
      return;
    }
    try {
      const res = await apiCall("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title: newTask.trim(), priority, dueDate: dueDate || null })
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to add task"));
      setNewTask("");
      setPriority("medium");
      setDueDate("");
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleDone(id) {
    try {
      const task = tasks.find(t => t._id === id);
      const wasNotDone = task && !task.done;

      const res = await apiCall(`/api/tasks/${id}`, { method: "PUT" });
      if (!res.ok) throw new Error(await readError(res, "Failed to update task"));
      
      await loadTasks();
      
      // Refresh user data to get updated XP
      const userRes = await apiCall("/api/auth/me");
      const userData = await userRes.json();
      setUserPoints(userData.xp);
      setUserLevel(userData.level);
      setStreak(userData.streak); // Update streak
      
      if (wasNotDone) {
        const points = task.priority === "high" ? 30 : 10;
        showPointsAnimation(points);
        
        if (battleMode) {
          handleBattleTaskComplete(task);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(id) {
    const task = tasks.find(t => t._id === id);
    try {
      const res = await apiCall(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Failed to delete task"));

      // If the Pomodoro timer was running for this task, stop it
      if (timerTask && timerTask._id === id) {
        setIsTimerRunning(false);
        setTimerTask(null);
        setPomodoroTime(customDuration * 60);
      }

      await loadTasks();
      const name = task ? (task.title.length > 40 ? task.title.slice(0, 40) + "…" : task.title) : "Task";
      showToast(`Deleted “${name}”`, { actionLabel: "Undo", onAction: () => restoreTask(id), duration: 7000 });
    } catch (err) {
      setError(err.message);
    }
  }

  // Undo a delete
  async function restoreTask(id) {
    try {
      const res = await apiCall(`/api/tasks/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, "Could not restore the task"));
      await loadTasks();
      showToast("Task restored ✅");
    } catch (err) {
      setError(err.message);
    }
  }
  // Edit Task Functions
  function startEditTask(task) {
    setEditingTask(task._id);
    setEditForm({
      title: task.title,
      priority: task.priority || 'medium',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
    });
  }

  function cancelEdit() {
    setEditingTask(null);
    setEditForm({ title: '', priority: '', dueDate: '' });
  }

  async function saveEdit(id) {
    if (!editForm.title.trim()) {
      setError("Task title cannot be empty");
      return;
    }
    try {
      const res = await apiCall(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(editForm)
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update task"));
      await loadTasks();
      setEditingTask(null);
      setEditForm({ title: '', priority: '', dueDate: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  // Battle Mode Functions
  function handleBattleTaskComplete(task) {
    const damage = task.priority === "high" ? 30 : task.priority === "medium" ? 20 : 10;
    const newBossHP = Math.max(0, bossHP - damage);
    setBossHP(newBossHP);
    setBattleTasksCompleted(prev => prev + 1);
    showBattleAnimation(`-${damage} HP`, "damage");

    if (newBossHP === 0) {
      defeatBoss();
    }

    if (Math.random() > 0.7) {
      const playerDamage = Math.floor(Math.random() * 10) + 5;
      setPlayerHP(prev => Math.max(0, prev - playerDamage));
      showBattleAnimation(`-${playerDamage} HP`, "player-damage");
    }
  }

  function defeatBoss() {
    const boss = bosses[Math.min(currentBoss - 1, bosses.length - 1)];
    showBattleAnimation(`🎉 BOSS DEFEATED! +${boss.reward} XP!`, "victory");
    setUserPoints(prev => prev + boss.reward);
    // Save the reward on the server so it is not lost after a refresh
    apiCall("/api/user/boss-reward", { method: "POST", body: JSON.stringify({ bossIndex: currentBoss }) })
      .then(res => res.json())
      .then(u => {
        if (u && u.xp !== undefined) {
          setUserPoints(u.xp);
          setUserLevel(u.level);
        }
      })
      .catch(() => {});
    setTotalBossesDefeated(prev => prev + 1);
    
    setTimeout(() => {
      if (currentBoss < bosses.length) {
        setCurrentBoss(prev => prev + 1);
        setBossHP(bosses[currentBoss].hp);
        setPlayerHP(100);
        setBattleTasksCompleted(0);
      } else {
        setBattleMode(false);
        showToast("🏆 YOU'RE THE ULTIMATE PRODUCTIVITY CHAMPION! 🏆", { duration: 9000 });
      }
    }, 2000);
  }

  function startBattleMode() {
    setBattleMode(true);
    setBossHP(bosses[0].hp);
    setPlayerHP(100);
    setBattleTasksCompleted(0);
    setCurrentBoss(1);
  }

  function showBattleAnimation(text, type) {
    const el = document.createElement('div');
    el.textContent = text;
    const colors = {
      damage: 'color:#ef4444;',
      victory: 'color:#22c55e;font-size:2rem;',
      'player-damage': 'color:#f59e0b;'
    };
    el.style.cssText = `position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);font-size:2rem;font-weight:bold;${colors[type]}animation:battle-float 1.5s ease-out;pointer-events:none;z-index:9999;text-shadow:0 0 20px currentColor`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function showPointsAnimation(points) {
    const el = document.createElement('div');
    el.textContent = `+${points} XP`;
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3rem;font-weight:bold;color:#fbbf24;animation:points-float 1s ease-out;pointer-events:none;z-index:9999;text-shadow:0 0 20px rgba(251,191,36,0.8)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // If the player's HP reaches 0 the boss battle restarts (as described in the project report)
  useEffect(() => {
    if (battleMode && playerHP === 0) {
      showToast("💀 You were defeated! The boss battle restarts.", { duration: 5000 });
      setPlayerHP(100);
      setBossHP(bosses[currentBoss - 1].hp);
      setBattleTasksCompleted(0);
    }
  }, [playerHP, battleMode]);

  // Pomodoro Functions
  useEffect(() => {
    let interval;
    if (isTimerRunning && pomodoroTime > 0) {
      interval = setInterval(() => setPomodoroTime(prev => prev - 1), 1000);
    } else if (pomodoroTime === 0) {
      setIsTimerRunning(false);
      playCompletionSound();
      showToast("🎉 Pomodoro completed! Take a 5-minute break!", { duration: 7000 });
      setPomodoroTime(customDuration * 60);
      setTimerTask(null);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, pomodoroTime, customDuration]);

  function playSound(frequency, duration) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  }

  function playStartSound() {
    playSound(523.25, 0.2);
    setTimeout(() => playSound(659.25, 0.2), 100);
    setTimeout(() => playSound(783.99, 0.3), 200);
  }

  function playCompletionSound() {
    playSound(783.99, 0.2);
    setTimeout(() => playSound(987.77, 0.2), 100);
    setTimeout(() => playSound(1046.50, 0.4), 200);
  }

  function playTickSound() {
    playSound(800, 0.05);
  }

  function startPomodoro(task) {
    setTimerTask(task);
    setPomodoroTime(customDuration * 60);
    setIsTimerRunning(true);
    playStartSound();
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  const recommendedTasks = getTaskRecommendations();
  const recommendedIds = new Set(recommendedTasks.map(t => t._id));
  const filteredTasks = tasks
    .filter(task => {
      if (filter === "active") return !task.done;
      if (filter === "completed") return task.done;
      return true; // "All" always shows every task
    })
    // Optional: only keep active tasks that suit the chosen mood
    .filter(task => !(onlyMoodMatches && currentMood) || task.done || recommendedIds.has(task._id))
    .filter(task => task.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // Sorting. Finished tasks sink to the bottom of the "All" list.
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (filter === "all" && a.done !== b.done) return a.done ? 1 : -1;
    if (sortBy === "oldest") return -byNewest(a, b);
    if (sortBy === "due") {
      if (!a.dueDate && !b.dueDate) return byNewest(a, b);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate) || byNewest(a, b);
    }
    if (sortBy === "priority") {
      return (priorityRank[a.priority || "medium"] - priorityRank[b.priority || "medium"]) || byNewest(a, b);
    }
    return byNewest(a, b);
  });

  const stats = {
    total: tasks.length,
    active: tasks.filter(t => !t.done).length,
    completed: tasks.filter(t => t.done).length,
    overdue: tasks.filter(t => !t.done && t.dueDate && daysUntil(t.dueDate) < 0).length
  };

  const getPriorityBadge = (priority) => {
    switch(priority) {
      case "high": return "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/50";
      case "medium": return "bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/50";
      case "low": return "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/50";
      default: return "bg-gradient-to-r from-slate-500 to-gray-500 text-white";
    }
  };

  // Label + colour for a task's due date ("Due today", "Overdue by 2 days", ...)
  function dueInfo(task) {
    const date = new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    if (task.done) return { label: date, className: "bg-white/20 text-purple-100" };
    const days = daysUntil(task.dueDate);
    if (days < 0) return { label: `Overdue by ${-days} day${days === -1 ? "" : "s"} · ${date}`, className: "bg-red-500/30 text-red-200 border-2 border-red-400 animate-pulse" };
    if (days === 0) return { label: `Due today · ${date}`, className: "bg-amber-500/30 text-amber-100 border-2 border-amber-300" };
    if (days === 1) return { label: `Due tomorrow · ${date}`, className: "bg-amber-500/20 text-amber-100" };
    return { label: date, className: "bg-white/20 text-purple-100" };
  }

  const progressToNextLevel = ((userPoints % 100) / 100) * 100;
  const currentBossData = bosses[Math.min(currentBoss - 1, bosses.length - 1)];

  // Login/Signup UI
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 w-full max-w-md">
          <div className="text-center mb-8">
            <Sparkles className="text-yellow-300 mx-auto mb-4" size={48} />
            <h1 className="text-4xl font-extrabold text-white mb-2">Task Master Pro</h1>
            <p className="text-purple-200">Level up your productivity</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border-2 border-red-400 text-white px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {!showLogin && (
              <input
                type="text"
                placeholder="Full Name"
                value={authForm.name}
                onChange={(e) => setAuthForm({...authForm, name: e.target.value})}
                className="w-full px-4 py-3 bg-white/20 border-2 border-white/30 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) => setAuthForm({...authForm, email: e.target.value})}
              className="w-full px-4 py-3 bg-white/20 border-2 border-white/30 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
             <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={authForm.password}
                onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                onKeyDown={(e) => e.key === "Enter" && (showLogin ? handleLogin() : handleSignup())}
                className="w-full px-4 py-3 bg-white/20 border-2 border-white/30 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-200 hover:text-white"
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
            
            <button
              onClick={showLogin ? handleLogin : handleSignup}
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-wait"
            >
              {authLoading ? "Please wait… (the server may take up to 30s to wake up)" : showLogin ? 'Login' : 'Sign Up'}
            </button>

            <button
              onClick={() => {
                setShowLogin(!showLogin);
                setError("");
              }}
              className="w-full text-white text-sm hover:text-purple-200 transition-colors"
            >
              {showLogin ? "Don't have an account? Sign Up" : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main App UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 sm:mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <Sparkles className="text-yellow-300 animate-pulse" size={32} />
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-2xl">Task Master Pro</h1>
              <p className="text-purple-100 text-base sm:text-xl font-bold">Welcome Back, {currentUser?.name} 👋!</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-white transition-all"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${
              activeTab === "tasks" ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <Target size={20} />
            Tasks
          </button>
          <button
            onClick={() => {
              setActiveTab("reports");
            }}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${
              activeTab === "reports" ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <FileText size={20} />
            Reports
          </button>
        </div>

        {activeTab === "reports" ? (
          // Reports View
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-8 border border-white/20">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-white">Monthly Productivity Report</h2>
                <div className="flex flex-wrap gap-3">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    className="px-4 py-2 bg-white/20 border-2 border-white/30 rounded-xl text-white font-medium"
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i} value={i + 1} className="bg-purple-900">
                        {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-4 py-2 bg-white/20 border-2 border-white/30 rounded-xl text-white font-medium"
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i).map(year => (
                      <option key={year} value={year} className="bg-purple-900">{year}</option>
                    ))}
                  </select>
                  <button
                    onClick={generateReport}
                    className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold py-2 px-4 rounded-xl transition-all"
                  >
                    <BarChart3 size={20} />
                    Generate
                  </button>
                  <button
                    onClick={downloadDetailedPDF}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-2 px-4 rounded-xl transition-all"
                  >
                  <FileText size={20} />
                   Download PDF
                  </button>
                </div>
              </div>

              {monthlyReport ? (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 rounded-xl p-4 sm:p-6 border border-white/20 hover:scale-105 transition-all">
                      <div className="text-4xl font-bold text-white mb-2">{monthlyReport.completedTasks}</div>
                      <div className="text-purple-200 text-sm">Tasks Completed</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 sm:p-6 border border-white/20 hover:scale-105 transition-all">
                      <div className="text-4xl font-bold text-white mb-2">{monthlyReport.highPriorityCompleted}</div>
                      <div className="text-purple-200 text-sm">High Priority</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 sm:p-6 border border-white/20 hover:scale-105 transition-all">
                      <div className="text-4xl font-bold text-white mb-2">{monthlyReport.xpEarned}</div>
                      <div className="text-purple-200 text-sm">XP Earned</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 sm:p-6 border border-white/20 hover:scale-105 transition-all">
                      <div className="text-4xl font-bold text-white mb-2">{monthlyReport.streakDays}</div>
                      <div className="text-purple-200 text-sm">Streak Days</div>
                    </div>
                  </div>

                  {/* Completion Rate */}
                  <div className="bg-white/10 rounded-xl p-4 sm:p-6 border border-white/20">
                    <h3 className="text-xl font-bold text-white mb-4">Completion Rate</h3>
                    <div className="w-full bg-white/20 rounded-full h-8">
                      <div
                        className="bg-gradient-to-r from-green-500 to-emerald-500 h-8 rounded-full flex items-center justify-center text-white font-bold transition-all duration-500"
                        style={{ width: `${(monthlyReport.completedTasks / monthlyReport.totalTasks * 100) || 0}%` }}
                      >
                        {Math.round((monthlyReport.completedTasks / monthlyReport.totalTasks * 100) || 0)}%
                      </div>
                    </div>
                    <p className="text-purple-200 text-sm mt-2">
                      {monthlyReport.completedTasks} out of {monthlyReport.totalTasks} tasks completed
                    </p>
                  </div>

                  {/* Insights */}
                  <div className="bg-white/10 rounded-xl p-4 sm:p-6 border border-white/20">
                    <h3 className="text-xl font-bold text-white mb-4">📊 Insights</h3>
                    <div className="space-y-3 text-purple-100">
                      <p>✅ You completed <span className="text-yellow-300 font-bold">{monthlyReport.completedTasks}</span> tasks this month!</p>
                      <p>🔥 You maintained a <span className="text-orange-400 font-bold">{monthlyReport.streakDays}-day</span> streak!</p>
                      <p>⚡ You earned <span className="text-blue-400 font-bold">{monthlyReport.xpEarned} XP</span> from your productivity!</p>
                      {monthlyReport.highPriorityCompleted > 0 && (
                        <p>🎯 You crushed <span className="text-red-400 font-bold">{monthlyReport.highPriorityCompleted}</span> high-priority tasks!</p>
                      )}
                      {(monthlyReport.completedTasks / monthlyReport.totalTasks * 100) >= 80 && (
                        <p className="text-green-400 font-bold">🏆 Outstanding! You're in the top 20% of productivity!</p>
                      )}
                    </div>
                  </div>

                  {/* Tasks counted in this report */}
                  <div className="bg-white/10 rounded-xl p-4 sm:p-6 border border-white/20">
                    <h3 className="text-xl font-bold text-white mb-1">📋 Tasks in this report</h3>
                    <p className="text-purple-200 text-sm mb-4">
                      Counts tasks created or finished in {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' })} {selectedYear}
                      {selectedMonth === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear() ? ", plus every task that is still open" : ""}. Deleted tasks are not counted.
                    </p>
                    {reportTasks.length === 0 ? (
                      <p className="text-purple-200">No tasks in this month.</p>
                    ) : (
                      <div className="space-y-2">
                        {reportTasks.map(t => (
                          <div key={t._id} className="flex items-center justify-between gap-3 bg-white/10 rounded-xl px-4 py-3">
                            <div className="min-w-0">
                              <p className={`font-medium truncate ${t.done ? "line-through text-purple-300" : "text-white"}`}>{t.title}</p>
                              <p className="text-xs text-purple-200">
                                Created {new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {t.completedAt ? ` · Completed ${new Date(t.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : " · Not completed yet"}
                              </p>
                            </div>
                            <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase ${getPriorityBadge(t.priority || "medium")}`}>
                              {t.priority || "medium"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-purple-200 py-12">
                  <BarChart3 className="mx-auto mb-4 text-purple-300" size={64} />
                  <p className="text-lg">No report available yet</p>
                  <p className="text-sm mt-2">Click "Generate" to create your monthly summary</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Tasks View - All existing content
          <>
        {showMoodSelector && (
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-8 mb-6 border border-white/20 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Smile className="text-yellow-300" size={28} />
                How are you feeling today?
              </h2>
              <div className="flex items-center gap-3">
                {currentMood && (
                  <button
                    onClick={clearMood}
                    className="text-sm font-bold text-purple-100 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-all"
                  >
                    Clear mood
                  </button>
                )}
                <button onClick={() => setShowMoodSelector(false)} title="Close" className="text-purple-200 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {moods.map((mood) => (
                <button
                  key={mood.id}
                  onClick={() => {
                    if (currentMood?.id === mood.id) {
                      clearMood(); // tap the selected mood again to un-select it
                    } else {
                      setCurrentMood(mood);
                      setShowMoodSelector(false);
                    }
                  }}
                  className={`p-4 sm:p-6 rounded-2xl border-2 transition-all duration-300 hover:scale-105 ${
                    currentMood?.id === mood.id
                      ? `bg-gradient-to-br ${mood.color} border-white text-white shadow-2xl`
                      : 'bg-white/10 border-white/30 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="text-4xl mb-2">{mood.emoji}</div>
                  <div className="font-bold">{mood.name}</div>
                </button>
              ))}
            </div>
            {currentMood && (
              <div className="mt-6 p-4 bg-white/10 rounded-xl border border-white/20">
                <p className="text-white text-center font-medium">{getMoodAdvice()}</p>
                <p className="text-purple-200 text-center text-sm mt-1">Tap the selected mood again to un-select it.</p>
              </div>
            )}
          </div>
        )}

        {/* Battle Mode */}
        {battleMode ? (
          <div className="bg-gradient-to-br from-red-500 via-purple-500 to-indigo-600 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-8 mb-6 border-4 border-yellow-400 animate-fade-in">
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white mb-2 flex flex-wrap items-center justify-center gap-3">
                <Swords className="text-yellow-300" size={40} />
                BATTLE MODE ACTIVATED
                <Swords className="text-yellow-300" size={40} />
              </h2>
              <p className="text-purple-100 text-lg">Complete tasks to damage the boss!</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
              <div className="bg-black/30 rounded-2xl p-4 sm:p-6 border-2 border-red-400">
                <div className="text-center mb-4">
                  <div className="text-6xl mb-2">{currentBossData.emoji}</div>
                  <div className="text-white font-bold text-xl">{currentBossData.name}</div>
                  <div className="text-purple-200 text-sm">Boss Level {currentBoss}</div>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden border-2 border-red-400">
                  <div 
                    className="h-full bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-500 flex items-center justify-center text-white text-xs font-bold"
                    style={{ width: `${(bossHP / currentBossData.hp) * 100}%` }}
                  >
                    {bossHP}/{currentBossData.hp} HP
                  </div>
                </div>
              </div>

              <div className="bg-black/30 rounded-2xl p-4 sm:p-6 border-2 border-green-400">
                <div className="text-center mb-4">
                  <div className="text-6xl mb-2">🛡️</div>
                  <div className="text-white font-bold text-xl">You</div>
                  <div className="text-purple-200 text-sm">Level {userLevel} Warrior</div>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden border-2 border-green-400">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500 flex items-center justify-center text-white text-xs font-bold"
                    style={{ width: `${playerHP}%` }}
                  >
                    {playerHP} HP
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-black/20 rounded-xl p-4 text-center mb-4">
              <div className="text-white font-bold text-lg mb-2">Battle Stats</div>
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-purple-100">
                <div>Tasks Completed: <span className="text-yellow-300 font-bold">{battleTasksCompleted}</span></div>
                <div>Bosses Defeated: <span className="text-yellow-300 font-bold">{totalBossesDefeated}</span></div>
              </div>
            </div>

            <button
              onClick={() => setBattleMode(false)}
              className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl transition-all"
            >
              Exit Battle Mode
            </button>
          </div>
        ) : (
          <div className="mb-6">
            <button
              onClick={startBattleMode}
              className="w-full bg-gradient-to-r from-red-500 via-purple-500 to-indigo-500 hover:from-red-600 hover:via-purple-600 hover:to-indigo-600 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 text-lg shadow-2xl hover:scale-105 transform"
            >
              <Swords size={24} />
              ⚔️ START BATTLE MODE ⚔️
              <Swords size={24} />
            </button>
          </div>
        )}

        {/* Gamification Stats Bar */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-6 mb-6 border border-white/20">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 p-3 rounded-xl shadow-lg">
                  <Trophy className="text-white" size={28} />
                </div>
                <div>
                  <div className="text-sm text-purple-200">Level</div>
                  <div className="text-3xl font-bold text-white">{userLevel}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-blue-400 to-cyan-500 p-3 rounded-xl shadow-lg">
                  <Zap className="text-white" size={28} />
                </div>
                <div>
                  <div className="text-sm text-purple-200">XP Points</div>
                  <div className="text-3xl font-bold text-white">{userPoints}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-orange-400 to-red-500 p-3 rounded-xl shadow-lg">
                  <Flame className="text-white" size={28} />
                </div>
                <div>
                  <div className="text-sm text-purple-200">Day Streak</div>
                  <div className="text-3xl font-bold text-white">{streak}</div>
                </div>
              </div>
              {currentMood ? (
                <div className="flex items-center bg-white/20 rounded-xl">
                  <button
                    onClick={() => setShowMoodSelector(true)}
                    title="Change mood"
                    className="flex items-center gap-2 pl-4 pr-2 py-2 hover:bg-white/10 rounded-l-xl transition-all"
                  >
                    <span className="text-2xl">{currentMood.emoji}</span>
                    <span className="text-white font-bold">{currentMood.name}</span>
                  </button>
                  <button
                    onClick={clearMood}
                    title="Clear mood"
                    className="px-3 py-2 text-purple-100 hover:text-white hover:bg-red-500/30 rounded-r-xl transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : !showMoodSelector && (
                <button
                  onClick={() => setShowMoodSelector(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all"
                >
                  <span className="text-2xl">🙂</span>
                  <span className="text-white font-bold">Set mood</span>
                </button>
              )}
            </div>
            <div className="lg:text-right">
              <div className="text-sm text-purple-200 mb-2">Next Level Progress</div>
              <div className="w-full lg:w-48 h-4 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-500"
                  style={{ width: `${progressToNextLevel}%` }}
                ></div>
              </div>
              <div className="text-xs text-purple-200 mt-1">{userPoints % 100}/100 XP</div>
            </div>
          </div>
        </div>

        {/* Pomodoro Timer */}
        {timerTask && (
          <div className="bg-gradient-to-r from-red-500 via-pink-500 to-purple-500 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-6 mb-6 border border-white/20 animate-fade-in">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <Clock className="text-white" size={32} />
                </div>
                <div className="min-w-0">
                  <div className="text-white/80 text-sm font-medium">🍅 Focus Session</div>
                  <div className="text-white font-bold text-lg break-words">{timerTask.title}</div>
                </div>
              </div>
              <button
                onClick={() => setShowDurationSettings(!showDurationSettings)}
                className="text-white/80 hover:text-white text-sm underline"
              >
                ⚙️ Settings
              </button>
            </div>

            {showDurationSettings && (
              <div className="mb-4 p-4 bg-white/10 rounded-xl">
                <label className="block text-white font-semibold mb-2 text-sm">
                  Pomodoro Duration (minutes)
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(Math.max(1, Math.min(90, parseInt(e.target.value) || 25)))}
                    className="w-24 px-4 py-2 bg-white/20 border-2 border-white/30 rounded-lg text-white font-bold text-center focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <button
                    onClick={() => {
                      setPomodoroTime(customDuration * 60);
                      setShowDurationSettings(false);
                    }}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-all"
                  >
                    Apply
                  </button>
                  <div className="flex gap-1">
                    {[15, 25, 45].map(min => (
                      <button
                        key={min}
                        onClick={() => {
                          setCustomDuration(min);
                          setPomodoroTime(min * 60);
                          setShowDurationSettings(false);
                        }}
                        className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-all"
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="text-5xl sm:text-6xl font-bold text-white tabular-nums">{formatTime(pomodoroTime)}</div>
                <div className="flex gap-3">
                  {!isTimerRunning ? (
                    <button
                      onClick={() => {
                        setIsTimerRunning(true);
                        playStartSound();
                      }}
                      className="bg-white/20 hover:bg-white/30 p-4 rounded-xl transition-all hover:scale-110"
                    >
                      <Play className="text-white" size={24} />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsTimerRunning(false);
                        playTickSound();
                      }}
                      className="bg-white/20 hover:bg-white/30 p-4 rounded-xl transition-all hover:scale-110"
                    >
                      <Pause className="text-white" size={24} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsTimerRunning(false);
                      setPomodoroTime(customDuration * 60);
                      setTimerTask(null);
                      playTickSound();
                    }}
                    className="bg-white/20 hover:bg-white/30 p-4 rounded-xl transition-all hover:scale-110"
                  >
                    <RotateCcw className="text-white" size={24} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-3 sm:p-6 border border-white/20 hover:scale-105 transform transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl sm:text-4xl font-bold text-white mb-1">{stats.total}</div>
                <div className="text-purple-200 font-medium text-xs sm:text-base">Total Tasks</div>
              </div>
              <div className="bg-gradient-to-br from-purple-400 to-pink-400 hidden sm:block p-4 rounded-xl shadow-lg">
                <Target className="text-white" size={28} />
              </div>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-3 sm:p-6 border border-white/20 hover:scale-105 transform transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl sm:text-4xl font-bold text-white mb-1">{stats.active}</div>
                <div className="text-purple-200 font-medium text-xs sm:text-base">In Progress</div>
                {stats.overdue > 0 && (
                  <div className="text-xs font-bold text-red-200">⚠ {stats.overdue} overdue</div>
                )}
              </div>
              <div className="bg-gradient-to-br from-blue-400 to-cyan-400 hidden sm:block p-4 rounded-xl shadow-lg">
                <TrendingUp className="text-white" size={28} />
              </div>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-3 sm:p-6 border border-white/20 hover:scale-105 transform transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl sm:text-4xl font-bold text-white mb-1">{stats.completed}</div>
                <div className="text-purple-200 font-medium text-xs sm:text-base">Completed</div>
              </div>
              <div className="bg-gradient-to-br from-green-400 to-emerald-400 hidden sm:block p-4 rounded-xl shadow-lg">
                <CheckCircle2 className="text-white" size={28} />
              </div>
            </div>
          </div>
        </div>

        {/* Add Task Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-8 mb-6 sm:mb-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Plus className="text-yellow-300" size={28} />
            Create New Task
          </h2>
          
          <div className="space-y-5">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="What's on your mind?"
              maxLength={200}
              className="w-full px-6 py-4 bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-400/50 focus:border-white/50 text-white placeholder-purple-200 text-lg font-medium transition-all duration-300"
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-white font-semibold mb-3 text-sm uppercase tracking-wide">
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-5 py-3 bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-xl focus:outline-none focus:ring-4 focus:ring-purple-400/50 text-white font-medium appearance-none cursor-pointer transition-all duration-300"
                >
                  <option value="low" className="bg-purple-900">🟢 Low Priority</option>
                  <option value="medium" className="bg-purple-900">🟡 Medium Priority</option>
                  <option value="high" className="bg-purple-900">🔴 High Priority</option>
                </select>
              </div>
              
              <div>
                <label className="block text-white font-semibold mb-3 text-sm uppercase tracking-wide">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-5 py-3 bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-xl focus:outline-none focus:ring-4 focus:ring-purple-400/50 text-white font-medium transition-all duration-300"
                />
              </div>
            </div>

            <button
              onClick={addTask}
              disabled={!newTask.trim()}
              className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 text-lg shadow-2xl hover:shadow-purple-500/50 hover:scale-105 transform"
            >
              <Plus size={24} />
              Add Task
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-4 sm:p-6 mb-6 sm:mb-8 border border-white/20">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-purple-200" size={22} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your tasks..."
                className="w-full pl-12 pr-12 py-4 bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-400/50 text-white placeholder-purple-200 font-medium transition-all duration-300"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-200 hover:text-white transition-colors"
                >
                  <X size={22} />
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 sm:px-6 py-3 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${
                  filter === "all" 
                    ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg shadow-purple-500/50" 
                    : "bg-white/20 text-white hover:bg-white/30"
                }`}
              >
                All <span className="opacity-80">({stats.total})</span>
              </button>
              <button
                onClick={() => setFilter("active")}
                className={`px-4 sm:px-6 py-3 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${
                  filter === "active" 
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/50" 
                    : "bg-white/20 text-white hover:bg-white/30"
                }`}
              >
                Active <span className="opacity-80">({stats.active})</span>
              </button>
              <button
                onClick={() => setFilter("completed")}
                className={`px-4 sm:px-6 py-3 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${
                  filter === "completed" 
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/50" 
                    : "bg-white/20 text-white hover:bg-white/30"
                }`}
              >
                Done <span className="opacity-80">({stats.completed})</span>
              </button>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  try { localStorage.setItem("sortBy", e.target.value); } catch { /* ignore */ }
                }}
                aria-label="Sort tasks"
                title="Sort tasks"
                className="px-3 sm:px-4 py-3 bg-white/20 border-2 border-white/30 rounded-xl text-white font-bold cursor-pointer hover:bg-white/30 transition-all"
              >
                <option value="newest" className="bg-purple-900">Sort: Newest first</option>
                <option value="oldest" className="bg-purple-900">Sort: Oldest first</option>
                <option value="due" className="bg-purple-900">Sort: Due date</option>
                <option value="priority" className="bg-purple-900">Sort: Priority</option>
              </select>
              {currentMood && (
                <button
                  onClick={() => setOnlyMoodMatches(!onlyMoodMatches)}
                  title="Show only the active tasks that suit your mood"
                  className={`px-4 sm:px-6 py-3 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${
                    onlyMoodMatches
                      ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-orange-500/50"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {currentMood.emoji} {onlyMoodMatches ? "Mood match: ON" : "Mood match"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 backdrop-blur-lg border-2 border-red-400 text-white px-6 py-4 rounded-2xl mb-6 font-medium shadow-xl">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Tasks List */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="relative inline-block">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-300 mx-auto"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <Sparkles className="text-yellow-300 animate-pulse" size={24} />
                </div>
              </div>
              <p className="mt-4 text-purple-200 font-medium text-lg">Loading your tasks...</p>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="p-12 text-center">
              <div className="bg-gradient-to-br from-purple-400 to-pink-400 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl">
                <Target className="text-white" size={40} />
              </div>
              <p className="text-purple-100 text-xl font-medium">
                {searchQuery ? "No tasks found matching your search" : onlyMoodMatches && currentMood ? `No tasks match your ${currentMood.name.toLowerCase()} mood right now.` : tasks.length > 0 ? "Nothing here for this filter." : "No tasks yet. Start by adding one!"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {sortedTasks.map((task, index) => (
                <div
                  key={task._id}
                  style={{ animationDelay: `${index * 50}ms` }}
                  className="p-4 sm:p-6 hover:bg-white/5 transition-all duration-300 animate-slide-in group"
                >
                  {editingTask === task._id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(task._id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        maxLength={200}
                        className="w-full px-4 py-2 bg-white/20 border-2 border-white/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                      <div className="flex flex-wrap gap-3">
                        <select
                          value={editForm.priority}
                          onChange={(e) => setEditForm({...editForm, priority: e.target.value})}
                          className="px-4 py-2 bg-white/20 border-2 border-white/30 rounded-xl text-white"
                        >
                          <option value="low" className="bg-purple-900">Low</option>
                          <option value="medium" className="bg-purple-900">Medium</option>
                          <option value="high" className="bg-purple-900">High</option>
                        </select>
                        <input
                          type="date"
                          value={editForm.dueDate}
                          onChange={(e) => setEditForm({...editForm, dueDate: e.target.value})}
                          className="px-4 py-2 bg-white/20 border-2 border-white/30 rounded-xl text-white"
                        />
                        <button
                          onClick={() => saveEdit(task._id)}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    //View Mode
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => toggleDone(task._id)}
                      aria-label={task.done ? "Mark as not done" : "Mark as done"}
                      className="mt-1 flex-shrink-0 transition-all duration-300 hover:scale-110 transform"
                    >
                      {task.done ? (
                        <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-full p-1 shadow-lg shadow-green-500/50">
                          <CheckCircle2 size={28} className="text-white" />
                        </div>
                      ) : (
                        <Circle size={28} className="text-purple-300 hover:text-white" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className={`text-lg font-medium mb-1 break-words ${
                            task.done 
                              ? "line-through text-purple-300" 
                              : "text-white"
                          }`}>
                            {task.title}
                          </p>
                          <p className="text-xs text-purple-200 mb-3">
                            Created {formatShortDate(task.createdAt)}{task.completedAt ? ` · Done ${formatShortDate(task.completedAt)}` : ""}
                          </p>
                          
                          <div className="flex flex-wrap items-center gap-3">
                            <span className={`text-xs px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold uppercase tracking-wider ${getPriorityBadge(task.priority || "medium")}`}>
                              {task.priority || "medium"}
                            </span>

                            {currentMood && !task.done && recommendedIds.has(task._id) && (
                              <span className="text-xs px-3 py-2 rounded-full font-bold bg-white/20 text-yellow-200">
                                ✨ Fits your {currentMood.name.toLowerCase()} mood
                              </span>
                            )}
                            
                            {task.dueDate && (() => {
                              const due = dueInfo(task);
                              return (
                                <span className={`text-xs sm:text-sm flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-medium ${due.className}`}>
                                  <CalendarIcon size={16} />
                                  {due.label}
                                </span>
                              );
                            })()}
                            
                            {!task.done && !timerTask && (
                              <button
                                onClick={() => startPomodoro(task)}
                                className="text-xs sm:text-sm flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-medium bg-gradient-to-r from-red-500 to-pink-500 text-white hover:from-red-600 hover:to-pink-600 transition-all hover:scale-105 shadow-lg"
                              >
                                <Play size={14} />
                                Pomodoro
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {!task.done && (
                            <button
                              onClick={() => startEditTask(task)}
                              className="flex-shrink-0 text-blue-300 hover:text-blue-400 transition-all duration-300 p-2 sm:p-3 hover:bg-blue-500/20 rounded-xl group-hover:scale-110 transform text-xl"
                              title="Edit task"
                              aria-label="Edit task"
                            >
                              ✏️
                            </button>
                          )}
                        
                        <button
                          onClick={() => deleteTask(task._id)}
                          title="Delete task"
                          aria-label="Delete task"
                          className="flex-shrink-0 text-purple-300 hover:text-red-400 transition-all duration-300 p-2 sm:p-3 hover:bg-red-500/20 rounded-xl group-hover:scale-110 transform"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        
        <div className="text-center mt-8 text-purple-200 font-medium">
          <p className="flex items-center justify-center gap-2">
            Made with <span className="text-pink-400 animate-pulse">❤️</span> using VITE, REACT, NODE.JS & MONGODB
          </p>
        </div>
        </>
      )}
      </div>

      {/* Pop-up messages */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 w-[calc(100%-1.5rem)] max-w-md" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-4 bg-gray-900/95 text-white rounded-xl px-4 py-3 shadow-2xl border border-white/20 animate-fade-in">
            <span className="text-sm font-medium break-words min-w-0">{t.message}</span>
            <div className="flex items-center gap-3 flex-shrink-0">
              {t.actionLabel && (
                <button
                  onClick={() => { if (t.onAction) t.onAction(); dismissToast(t.id); }}
                  className="text-yellow-300 hover:text-yellow-200 font-bold text-sm"
                >
                  {t.actionLabel}
                </button>
              )}
              <button onClick={() => dismissToast(t.id)} aria-label="Dismiss message" className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}