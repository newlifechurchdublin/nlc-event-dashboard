# New Life Church Dublin — Event Dashboard

A simple, pretty dashboard to plan church events, delegate tasks to volunteers,
and track costs. Works with **Firebase (Firestore)** for real-time sync across
everyone who opens the link, or in a **local demo mode** (browser-only) so you
can try it instantly with no setup.

## What's inside

| File | Purpose |
|---|---|
| `index.html` | App shell with tabs: Overview, Events, Tasks & Teams, People, Budget |
| `styles.css` | NLC green-and-cream theme |
| `app.js` | All logic — Firestore or localStorage, rotation suggestions, admin lock |
| `firebase-config.js` | Paste your Firebase keys here; toggle `USE_LOCAL_DEMO` |
| `logo.png`, `Pastorandfamily.png` | Branding used in the header |

## Try it instantly (no Firebase yet)

1. Open `firebase-config.js` — make sure `USE_LOCAL_DEMO = true`.
2. Double-click `index.html`. Some browsers block ES modules opened as files.
   If that happens, run a tiny local server from this folder:
   ```
   python -m http.server 5500
   ```
   Then visit http://localhost:5500
3. Click **Admin Sign-in** → enter passcode (default `pauline2026`).
4. Try **+ New Event**, pick it, open **Tasks & Teams**, click **Seed standard
   tasks**. Assign volunteers and watch rotation suggestions appear.

Local demo stores everything in your browser only — great for learning the UI.

## Go live with Firebase + GitHub Pages

### 1. Create a Firebase project (free tier is plenty)

1. Go to https://console.firebase.google.com → **Add project**.
2. In **Build → Firestore Database**, create a database in **production mode**.
3. In **Project Settings → General → Your apps**, add a **Web app** and copy
   the config object (apiKey, authDomain, projectId, etc.).

### 2. Paste config into `firebase-config.js`

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "nlc-dublin.firebaseapp.com",
  projectId: "nlc-dublin",
  storageBucket: "nlc-dublin.appspot.com",
  messagingSenderId: "...",
  appId: "1:..."
};
export const ADMIN_PASSCODE = "choose-a-passcode";
export const USE_LOCAL_DEMO = false;
```

### 3. Add Firestore security rules (recommended)

In Firebase Console → Firestore → Rules, paste this starter (allows anyone
with the link to read/write — fine for a trusted church team):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

If you want tighter control later, switch to Firebase Authentication and
require a signed-in user for writes.

### 4. Host on GitHub Pages

1. Create a new GitHub repo (e.g. `nlc-event-dashboard`) and upload all files
   in this folder (keep the images).
2. In the repo: **Settings → Pages → Branch: `main` / root → Save**.
3. After a minute, your dashboard lives at
   `https://<your-username>.github.io/nlc-event-dashboard/`.
4. Share the link with the team. Pauline signs in with the passcode to edit.

## How the rotation suggestion works

For each task, the app looks at:

1. **Who was assigned in the most recent past event** — those people are
   pushed *down* the suggestion list so new faces rotate in.
2. **How many past assignments each person has** — fewer = higher priority.

This surfaces volunteers who *haven't* served recently. Pauline can always
override manually — suggestions are just hints, never forced.

## Admin mode

- Click **Admin Sign-in** in the top right, enter the passcode.
- Add/edit/delete buttons appear throughout the dashboard.
- Click **Lock** to exit admin mode.
- Change the passcode in `firebase-config.js`.

> The passcode is a convenience lock for a trusted team, not cryptographic
> security. For real protection, use Firestore rules + Firebase Auth.

## The "standard tasks" seeder

On the Tasks & Teams tab, after picking an event, click
**Seed standard tasks** to add in one click:

- Decoration: chairs with cloth, decorate the church
- Shopping: decorations, table/chair cloth, paper plates
- Food: arrange food, cook sweet, serve starters, serve main
- Media: sound/slides, photography
- Games: conductors, volunteer support
- Kids: child-minding teacher
- Setup/Cleanup: wash dishes, clean the room (2h × 4 people noted), store decorations

Edit or delete any of them — it's a starting point, not a fixed list.

## Roadmap ideas (optional)

- WhatsApp share button for each task assignment
- ICS calendar export per event
- Per-person history page ("Pauline's last 5 events")
- Firebase Auth with Pauline as an admin role (replaces passcode)

---

Built with care for Pastor and Pauline. ✝
