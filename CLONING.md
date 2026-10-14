# Making a copy of the app for another house

The app is the same for every house. Only a few things are specific to one house, and each lives in one obvious place:

| What | Where |
|---|---|
| House name, "Task Tracker" title, starting people and rooms, storage prefix | `site-config.js` |
| Colours, fonts, logo treatment | `theme.css` (ready-made palettes in `presets/`) |
| Icons and header logo | `icons/` (generate with `tools/make-icons.py`) |
| Name shown when installed on a phone | `manifest.webmanifest`, and `<title>` / `apple-mobile-web-app-title` / `theme-color` in `index.html` |
| The shared database | `firebase-config.js` (the new house's own Firebase project) |

No other file needs touching. Follow the steps in order.

## 1. Create the repo
In the original repo, check that the **default branch** is the one holding the latest pushed work (a template copy takes the default branch only). Then **Settings → General → Template repository** (tick it) and **Use this template → Create a new repository**. Give it a name for the house. Make it **public** if you want free GitHub Pages hosting.

## 2. Disconnect it from the original database (do this first)
The template still contains the original house's Firebase details. Replace the contents of `firebase-config.js` with the blank version below so the copy can never write to someone else's database. The app then runs in local-only mode until step 7.

```js
// Firebase web app config (see README.md, "Shared database setup").
// While apiKey is empty the app runs in local-only mode (data stays on this device).
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
```

## 3. `site-config.js`
Set `name` (shown as "<name> Task Tracker"), `title` if you want a different suffix, `people` and `rooms`.

**`storagePrefix` must be different from the original's.** Copies hosted under the same GitHub username share one website address. If the prefix is left as `rosedene`, the copy reads the original's saved passcode and settings, and its **Lock** button would wipe the original's saved passcode too. Use a short lowercase code for the house (letters, numbers, dashes).

People and rooms can also be changed later inside the app (**Manage**) once the board exists; the lists here are only the starting point for a brand-new board.

## 4. `theme.css`
Either copy a preset over it, e.g. `cp presets/navy-slate-terracotta.css theme.css`, or edit the variables by hand. The comment block at the top of each theme file (and of every preset) explains what each variable is for.
- Check readability: `python3 tools/check-contrast.py theme.css` (aim for no warnings; the original Cancún palette is deliberately soft and flags several).
- A **dark** main colour needs light `--text` colours, `color-scheme: dark`, and the logo shown on a white tile (`--logo-blend: normal; --logo-bg: #FFFFFF; --logo-radius: 10px`). The navy preset does all of this. A **light** main colour keeps `--text` dark and lets the logo's white background melt away (`--logo-blend: multiply`).
- Set `<meta name="theme-color">` in `index.html` and `background_color` / `theme_color` in `manifest.webmanifest` to the `--main` colour.

## 5. Icons and logo
- With a picture of the house: `python3 tools/make-icons.py --image path/to/house.jpg`
- Placeholder from the house number: `python3 tools/make-icons.py --text 83 --bg "<--main>" --fg "<--text>" --accent "<--accent>"`, taking the three colours from the chosen theme (the navy preset's are `#1B2A45`, `#F4F0E8`, `#D9805F`).

Needs `pip install pillow`. Text mode downloads the Cormorant Garamond font once from the open `google/fonts` repository, and falls back to a system serif font if it can't. When the real picture arrives, run the `--image` command; nothing else changes.

## 6. Names that appear before the app loads
- `index.html`: `<title>` and `<meta name="apple-mobile-web-app-title">`
- `manifest.webmanifest`: `name` and `short_name`; `description` only if it names the house. Keep `short_name` and the apple title to about 12 characters (phones truncate longer home-screen labels, e.g. "83 Richmond" for "83 Richmond Road").
- `README.md`: the title, the Firebase project and web-app names in setup steps 1 and 4 (use the same short name), and the "Install on your phone" sentence about the house image.
- `sw.js`: delete the `|| k === 'rosedene-shell-v1'` clause in the activate handler (a one-off clean-up for the original app).

Then search the whole repo for the original name, ignoring case: `grep -rniE "rosedene" . --exclude-dir=.git --exclude=CLONING.md`. After the edits above it should find nothing; any remaining hit is something that was missed.

## 7. Check it locally
Serve the folder and open it in a browser: `python3 -m http.server 8000`, then <http://localhost:8000/>. (Opening `index.html` straight from disk does not work, because browsers block module scripts on `file://`.) With the blank `firebase-config.js` it runs in local-only mode with no passcode screen. Check the header shows the new name, and add a task.

## 8. The shared database
Follow **Shared database setup** in `README.md` with a **new** Firebase project (their own Google account is best, so they own their data). Paste the new project's config into `firebase-config.js`. The Firestore rules in the README work unchanged. The first person to open the app chooses a 6-digit passcode and taps **Create a new board**; everyone else uses the same code.

## 9. Publish
**Settings → Pages → Deploy from a branch**, choose the branch, folder `/ (root)`, **Save**. The address will be `https://<username>.github.io/<repo-name>/`. Open it, enter the passcode, add a test task, then open it on a phone to confirm it syncs (the little dot beside the "I'm" picker turns green).

## Later changes
The copy is independent, so features added to the original later won't appear automatically. To bring one across, ask Claude to port it from the original repo; because house-specific values are confined to the files above, it is normally a copy of `app.js` / `styles.css` changes.
