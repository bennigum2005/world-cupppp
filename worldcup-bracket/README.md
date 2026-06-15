# ⚽ World Cup Bracket Predictor

A simple bracket prediction game — no accounts, just name + email. Admin view shows all entries privately.

---

## Project structure

```
worldcup-bracket/
├── frontend/
│   ├── index.html    ← the game UI
│   ├── style.css     ← all styles
│   └── app.js        ← bracket logic + API calls
├── backend/
│   └── server.js     ← Express API + JSON file database
├── package.json
├── Procfile          ← for Railway / Render deployment
└── .gitignore
```

---

## Running locally

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```

Open **http://localhost:3000** in your browser.

For live reload during development:
```bash
npm run dev
```

---

## How it works

| URL | Who sees it | What it shows |
|-----|------------|---------------|
| `http://your-site.com` | Everyone | The bracket game — enter name + email, pick winners |
| `http://your-site.com?admin=1` | You only | Same game + admin controls + full entries list |

**Admin controls** (only visible at `?admin=1`):
- **Unlock bracket** — loads the 16 playoff teams and opens picking
- **Lock bracket** — closes picking (e.g. once the tournament starts)
- **Reset my picks** — clears your own picks for testing

**To set the real teams**, edit `DEMO_TEAMS` in `frontend/app.js` with the actual qualified nations before unlocking.

---

## Deploying to Railway (free, recommended)

Railway gives you a free persistent server — picks save permanently.

1. Push this repo to GitHub (see below)
2. Go to **https://railway.app** → New Project → Deploy from GitHub repo
3. Select your repo — Railway auto-detects Node.js
4. It will deploy automatically. Copy the public URL Railway gives you.
5. Visit `https://your-app.railway.app?admin=1` to manage the bracket

That's it — Railway handles everything including keeping `db.json` persistent.

---

## Pushing to GitHub

```bash
# Inside the worldcup-bracket folder:
git init
git add .
git commit -m "Initial commit — World Cup bracket predictor"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/worldcup-bracket.git
git branch -M main
git push -u origin main
```

---

## When the playoff teams are confirmed

1. Open `frontend/app.js`
2. Find the `DEMO_TEAMS` array near the top
3. Replace the team names and flags with the actual qualified nations
4. Push to GitHub — Railway redeploys automatically
5. Go to `?admin=1` and click **Unlock bracket**

---

## Sharing with friends

Just send them the plain URL (no `?admin=1`). They enter their name and email, and their picks are saved. If they close the tab and come back, entering the same email restores their picks.

---

## Data storage

All data lives in `backend/db.json` (created automatically on first run). It stores:
- Bracket lock state and team list
- All entries (name, email, picks, champion)

The file is excluded from git via `.gitignore` so nobody's email is committed to the repo.
