# Motion ✦

> Your workspace, simplified — Designed for clarity.

Motion brings your notes, databases, and tasks together into a single, serene workspace designed for deep focus and effortless organization.

![Status](https://img.shields.io/badge/status-in%20development-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- **Dashboard** — Unified overview of your workspace activity
- **Notes** — Rich note-taking with real-time saving
- **Kanban Board** — Visual task management with drag-and-drop
- **Database Views** — Structured data with custom fields
- **Rich Text Editor** — Block-based document editor
- **Dark Mode** — System-aware theme switching
- **Google OAuth** — One-click sign-in with Google
- **Row Level Security** — Data isolation per user via Supabase RLS

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite |
| Styling | TailwindCSS + Custom CSS Design Tokens |
| Backend | [Supabase](https://supabase.com) (Auth, Database, RLS) |
| Database | PostgreSQL (via Supabase) |
| Fonts | Inter (Google Fonts) |
| Icons | Material Symbols Outlined |

## 📁 Project Structure

```
G-Project/
├── index.html              # App entry point
├── vite.config.js          # Vite configuration
├── package.json            # Dependencies & scripts
├── src/
│   ├── main.jsx            # React root mount
│   ├── App.jsx             # Main App component (shell, routing, auth)
│   ├── styles.css          # Design system (CSS custom properties)
│   ├── App.css             # App-specific styles
│   ├── index.css           # Global base styles
│   ├── components/
│   │   └── Login.jsx       # Authentication component
│   ├── lib/
│   │   ├── supabase.js     # Supabase client & auth helpers
│   │   ├── queries.js      # Data access layer (all DB queries)
│   │   └── config.js       # Supabase configuration
│   └── legacy/             # Pages being migrated to React
│       ├── app.js          # Shared state bridge (AppState)
│       └── pages/          # Dashboard, Notes, Kanban, etc.
├── sql/
│   └── schema.sql          # Full database schema (tables, RLS, triggers)
└── public/                 # Static assets
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18 or higher)
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/G-Project.git
cd G-Project
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Supabase credentials

Create a `.env` file from the example:
```bash
cp .env.example .env
```

Or edit `src/lib/config.js` directly with your Supabase credentials:
- Go to [Supabase Dashboard](https://supabase.com/dashboard) → Your Project → Settings → API
- Copy **Project URL** and **anon public key**

### 4. Set up the database

Run the SQL in `sql/schema.sql` in your Supabase SQL Editor. This creates:
- Tables: `users`, `workspaces`, `pages`, `notes`, `tasks`, `settings`
- Row Level Security policies for all tables
- Auto-create triggers for new user profiles

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint code checks |

## 🗄 Database Schema

The app uses 6 core tables:

| Table | Purpose |
|-------|---------|
| `users` | User profiles (extends Supabase Auth) |
| `workspaces` | User workspaces |
| `pages` | Notes, documents, kanban boards, databases |
| `notes` | Note blocks within pages |
| `tasks` | Tasks with status, priority, and assignments |
| `settings` | Per-user preferences and theme settings |

All tables are protected with **Row Level Security (RLS)** — users can only access their own data.

## 🔐 Environment & Security

- Supabase credentials are stored in `src/lib/config.js` (git-ignored) or `.env`
- Use `.env.example` as a template
- Never commit API keys or secrets to the repository

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

*Built with focus and simplicity in mind.*
