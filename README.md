# ⚽ World Cup Bracket Predictor

No server needed — uses JSONBin.io as a free database. Host on GitHub Pages for free.

---

## One-time setup (5 minutes)

### Step 1 — Create your free JSONBin database

1. Go to **https://jsonbin.io** and click "Sign Up" (free)
2. After logging in, click **"Create Bin"**
3. Paste this as the starting content and click Save:
```json
{
  "bracketState": { "locked": true, "teams": [] },
  "entries": []
}
```
4. Copy the **Bin ID** from the URL — it looks like `64abc123def456`
5. Go to **API Keys** in the left menu → create a key → copy it

### Step 2 — Add your keys to the app

Open `frontend/app.js` and find lines 10-11 near the top:
```js
const JSONBIN_BIN_ID  = 'PASTE_YOUR_BIN_ID_HERE';
const JSONBIN_API_KEY = 'PASTE_YOUR_API_KEY_HERE';
```
Replace the placeholder text with your actual Bin ID and API key.

### Step 3 — Push to GitHub

```bash
git init
git add .
git commit -m "World Cup bracket predictor"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/worldcup-bracket.git
git branch -M main
git push -u origin main
```

### Step 4 — Enable GitHub Pages (free hosting)

1. Go to your repo on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under "Source", select **main branch** and set folder to `/frontend`
4. Click Save — GitHub gives you a URL like `https://yourusername.github.io/worldcup-bracket`

That's it — share that URL with your friends!

---

## How to use it

| URL | Who | What |
|-----|-----|------|
| `https://yourusername.github.io/worldcup-bracket` | Everyone | Enter name + email, pick winners |
| Same URL + `?admin=1` | You only | Admin controls + all entries list |

**Admin controls** (add `?admin=1` to the URL):
- **Unlock bracket** — loads the 16 playoff teams and opens picking
- **Lock bracket** — closes picking
- **Reset my picks** — clears your own picks for testing

---

## When the playoff teams are confirmed

1. Open `frontend/app.js`
2. Find the `DEMO_TEAMS` array and replace with the real qualified nations + flag emojis
3. Push to GitHub — site updates in ~60 seconds
4. Go to `?admin=1` and click **Unlock bracket**

---

## Sharing with friends

Send the plain URL (no `?admin=1`). They enter name + email and their picks save automatically. If they close the tab and come back, entering the same email restores their picks.
