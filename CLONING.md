# Making a copy of the app for another house

The app is the same for every house. Only five things are specific to one house, and each lives in one obvious place:

| What | Where |
|---|---|
| House name, "Task Tracker" title, starting people and rooms, storage prefix | `site-config.js` |
| Colours, fonts, logo treatment | `theme.css` (ready-made palettes in `presets/`) |
| Icons and header logo | `icons/` (generate with `tools/make-icons.py`) |
| Name shown when installed on a phone | `manifest.webmanifest`, and `<title>` / `apple-mobile-web-app-title` / `theme-color` in `index.html` |
| The shared database | `firebase-config.js` (your own Firebase project) |

No other file needs touching. Follow the steps in order.

## 1. Create the repo
In the original repo go to **Settings → General → Template repository** (tick it), then **Use this template → Create a new repository**. Give it a name for the house. Make it **public** if you want free GitHub Pages hosting.

## 2. Disconnect it from the original database (do this first)
The template still contains the original house's Firebase details. Replace the contents of `firebase-config.js` with the empty version below so the copy can never write to someone else's database. The app then runs in local-only mode until step 7.

```js
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
**`storagePrefix` must be unique.** Copies hosted under the same GitHub username share one website address, and the prefix stops them reading each other's saved passcode and settings. People and rooms can also be changed later inside the app (**Manage**) once the board exists; the lists here are only the starting point for a brand-new board.

## 4. `theme.css`
Either copy a preset over it, e.g. `cp presets/navy-slate-terracotta.css theme.css`, or edit the variables by hand. The comment at the top of `theme.css` explains each one.
- Check readability: `python3 tools/check-contrast.py theme.css` (aim for no warnings).
- A **dark** main colour needs light `--text` colours and the logo shown on a white tile (`--logo-blend: normal; --logo-bg: #FFFFFF`). The navy preset does this. A **light** main colour keeps `--text` dark and the logo's white background can melt away (`--logo-blend: multiply`).
- Update `<meta name="theme-color">` in `index.html` and `background_color` / `theme_color` in `manifest.webmanifest` to the `--main` colour.

## 5. Icons and logo
- With a picture of the house: `python3 tools/make-icons.py --image path/to/house.jpg`
- Placeholder from the house number: `python3 tools/make-icons.py --text 83 --bg "#1B2A45" --fg "#F4F0E8" --accent "#D9805F"`

(Needs `pip install pillow`.) When the real picture arrives, run the `--image` command again; nothing else changes.

## 6. Names that appear before the app loads
- `index.html`: `<title>` and `<meta name="apple-mobile-web-app-title">`
- `manifest.webmanifest`: `name`, `short_name`, `description`
- `README.md`: title and the Firebase project name in the setup steps

Then search the whole repo for the original name, ignoring case (`grep -rniE "rosedene" . --exclude-dir=.git --exclude=CLONING.md`). Every hit should be deliberate (for example, this file or the README's wording).

## 7. The shared database
Follow **Shared database setup** in `README.md` with a **new** Firebase project (their own Google account is best, so they own their data). Paste the new project's config into `firebase-config.js`. The Firestore rules in the README work unchanged. The first person to open the app chooses a 6-digit passcode and taps **Create a new board**; everyone else uses the same code.

## 8. Publish
**Settings → Pages → Deploy from a branch**, choose the branch, folder `/ (root)`, **Save**. The address will be `https://<username>.github.io/<repo-name>/`. Open it, enter the passcode, add a test task, then open it on a phone to confirm it syncs (the little dot beside the "I'm" picker turns green).

## Later changes
The copy is independent, so features added to the original later won't appear automatically. To bring one across, ask Claude to port it from the original repo; because house-specific values are confined to the files above, it is normally a copy of `app.js` / `styles.css` changes.
