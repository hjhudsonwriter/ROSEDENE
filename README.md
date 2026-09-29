# Rosedene Task Tracker

A phone-friendly kanban board for our house projects. Static files only — host it anywhere (GitHub Pages is easiest).

## Shared database setup (free, no card needed)

The app syncs through Google Firebase **Firestore** on the free *Spark* plan (no billing details required).
Until you complete this, the app still works but only saves on the device you're using.

1. Go to <https://console.firebase.google.com> → **Add project** → name it `rosedene` (turn Google Analytics off).
2. In the project: **Build → Firestore Database → Create database**. Choose a UK/EU location (e.g. `europe-west2`) and start in **production mode**.
3. Open the **Rules** tab, replace the contents with the rules below and **Publish**.
4. **Project settings (cog) → General → Your apps → Web (`</>`)** → register an app called `rosedene` (no hosting needed). Copy the `firebaseConfig` values it shows.
5. Paste them into `firebase-config.js`, commit and push.
6. If you host on GitHub Pages: repo **Settings → Pages → Deploy from branch**. Then in Firebase **Authentication → Settings → Authorized domains** isn't needed (we don't use Auth), so you're done.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // The board's name IS the 6-digit passcode. Boards can't be listed, so you must know the code.
    match /houses/{code}/{document=**} {
      allow read, write: if code.matches('[0-9]{6}');
    }
  }
}
```

**Passcode:** when the app opens it asks for a 6-digit passcode. The passcode is the name of the board in the database and the rules above don't allow boards to be listed, so nobody can read or edit tasks without knowing it. The first time you enter a new passcode the app offers to create a new board for it; after that everyone uses the same code. Choose one that isn't obvious (a stranger could in theory guess codes one by one). Use **People → Lock this device** to forget the code on a shared phone.

Free-tier limits (Spark): 1 GiB storage, 50k reads and 20k writes per day — far more than a house project needs. Photos are compressed and stored inside each task (about 8–10 per task max), which avoids Firebase Storage, which is no longer free.

## Install on your phone

Open the site in Safari (iPhone: Share → *Add to Home Screen*) or Chrome (Android: menu → *Install app*). It uses the Rosedene house image as the icon.
