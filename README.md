# ProjectOS — Project Management Dashboard

A full-featured project management dashboard for SEO, Google Ads, Meta Ads, and general projects.  
Built with vanilla HTML/CSS/JS + Firebase. Hosted on GitHub Pages.

---

## ✨ Features

- 🔐 **Login system** — Email/password + Google Sign-In
- 👥 **User roles** — Super Admin, Admin, Member
- 📁 **Project types** — SEO · Google Ads · Meta Ads · General
- 📊 **Dashboard** — Live stats, project breakdown, recent activity
- 🗂️ **Project detail tabs** — Overview, Tasks, Team, Credentials, Tools, Analytics, Notes
- ✅ **Task management** — Kanban board with To Do / In Progress / Review / Done columns
- 🔑 **Credentials vault** — Store logins per project
- 🛠️ **Tools tracker** — Track tools used per project
- 📈 **Analytics flags** — GA, Search Console, Google Ads, Meta Ads, SEMrush, Ahrefs
- ⏸️ **Project pause/resume** — Track pause history and dates
- 🎨 **The Seasons font** — Elegant serif display font (instructions below)
- 📱 **Responsive** — Works on mobile and desktop

---

## 🚀 SETUP GUIDE

### Step 1 — Create Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → name it (e.g. `projectos-dashboard`)
3. Disable Google Analytics (optional) → click **Create project**

---

### Step 2 — Enable Authentication

1. In Firebase Console → **Authentication** → **Get started**
2. Click **Sign-in method** tab
3. Enable **Email/Password** → Save
4. Enable **Google** → set support email → Save

---

### Step 3 — Create Firestore Database

1. In Firebase Console → **Firestore Database** → **Create database**
2. Choose **"Start in test mode"** (you'll secure it later) → Next
3. Choose your preferred server location → **Enable**

---

### Step 4 — Set Firestore Security Rules

Go to Firestore → **Rules** tab and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read/write their own document
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null;
    }

    // Projects — authenticated users only
    match /projects/{projectId} {
      allow read, write: if request.auth != null;

      match /tasks/{taskId} {
        allow read, write: if request.auth != null;
      }
    }

    // Credentials — authenticated users only
    match /credentials/{credId} {
      allow read, write: if request.auth != null;
    }

    // Tools — authenticated users only
    match /tools/{toolId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Click **Publish**.

---

### Step 5 — Get Firebase Config

1. In Firebase Console → **Project Settings** (gear icon)
2. Scroll to **"Your apps"** → click **"</>"`** (Web)
3. Register app (name it `ProjectOS Web`)
4. Copy the `firebaseConfig` object

---

### Step 6 — Add Config to the Project

Open `js/config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",           // ← your actual key
  authDomain:        "my-project.firebaseapp.com",
  projectId:         "my-project",
  storageBucket:     "my-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc..."
};
```

---

### Step 7 — Add "The Seasons" Font (Optional)

The Seasons is a free premium-feel serif font. To use it:

1. Download from: **https://www.fontspace.com/the-seasons-font-f97771**  
   *(or search "The Seasons font free download")*
2. Convert to WOFF2 at: **https://cloudconvert.com/ttf-to-woff2**
3. Place these files in `/assets/fonts/`:
   ```
   assets/
   └── fonts/
       ├── TheSeasons-lt.woff2     (Light)
       ├── TheSeasons.woff2        (Regular)
       ├── TheSeasons-bd.woff2     (Bold)
       └── TheSeasons-it.woff2     (Italic)
   ```
4. The CSS already references these files. No code changes needed.

> **Without the font files**, Cormorant Garamond (Google Fonts) is used automatically as a beautiful fallback.

---

### Step 8 — Create First Admin User

1. Open `index.html` in your browser (or via GitHub Pages)
2. Click **"Sign In"** → use Google sign-in with your Google account
3. After login, go to Firebase Console → Firestore → `users` collection
4. Find your user document → edit the `role` field to `"super_admin"`

---

## 🌐 DEPLOY TO GITHUB PAGES

### Option A — Using GitHub Web (Easiest)

1. Create a new repository on GitHub (public)
2. Upload all project files (drag & drop in GitHub UI)
3. Go to repo **Settings** → **Pages** → Source: `main` branch, `/ (root)` folder
4. Click **Save** → your site is live at `https://yourusername.github.io/repo-name/`

### Option B — Using Git CLI

```bash
# 1. Initialize git in your project folder
cd project-dashboard
git init
git add .
git commit -m "Initial commit"

# 2. Create repo on GitHub first, then:
git remote add origin https://github.com/yourusername/project-dashboard.git
git branch -M main
git push -u origin main

# 3. Enable GitHub Pages in repo Settings → Pages
```

### Important for GitHub Pages

Since the app uses multiple HTML files, set the homepage to `index.html`.  
GitHub Pages serves `index.html` by default — this is the login page. ✅

---

## 📁 FILE STRUCTURE

```
project-dashboard/
├── index.html              ← Login page
├── app.html                ← Main dashboard SPA
├── css/
│   └── style.css           ← Complete stylesheet
├── js/
│   ├── config.js           ← Firebase config (YOU EDIT THIS)
│   ├── auth.js             ← Authentication functions
│   ├── db.js               ← Firestore CRUD operations
│   └── app.js              ← Main app, routing, views, modals
├── assets/
│   └── fonts/              ← Place The Seasons font files here
└── README.md
```

---

## 🗄️ FIRESTORE DATA STRUCTURE

```
users/{uid}
  ├── name, email, photoURL, role
  ├── createdAt, lastLogin

projects/{projectId}
  ├── name, description, type
  │   (general | seo | google_ads | meta_ads)
  ├── status
  │   (not_started | in_progress | on_hold | completed)
  ├── priority (low | medium | high | critical)
  ├── startDate, endDate, closedAt, pausedAt
  ├── ownerId, teamMembers[]
  ├── notes
  ├── hasAnalytics, hasSearchConsole, hasGoogleAds
  ├── hasMetaAds, hasSemrush, hasAhrefs
  ├── analyticsUrl, searchConsoleUrl, etc.
  ├── createdAt, updatedAt, createdBy
  └── tasks/ (subcollection)
      └── {taskId}
          ├── title, description
          ├── status (todo | in_progress | review | done)
          ├── priority, assigneeId, dueDate
          └── createdAt, updatedAt

credentials/{credId}
  ├── name, type, projectId
  ├── url, username, password, notes
  └── createdAt, createdBy

tools/{toolId}
  ├── name, category, projectId
  ├── url, notes
  └── createdAt
```

---

## 🔧 ADDING MORE FEATURES

Features can be added through the chat. Planned enhancements:

- [ ] Subtasks / task dependencies
- [ ] Task comments
- [ ] File attachments
- [ ] Milestone tracking with visual timeline
- [ ] Gantt chart view
- [ ] Recurring tasks
- [ ] Calendar view
- [ ] Export to PDF/CSV
- [ ] Email notifications
- [ ] Dark mode
- [ ] Project templates
- [ ] Client portal view
- [ ] Invoice tracking
- [ ] Time logging per task

---

## 🔒 SECURITY NOTES

- Credentials are stored in Firestore in plain text. For production, encrypt sensitive data before storing.
- Always secure your Firestore rules before going live (see Step 4).
- Do NOT commit `js/config.js` with real API keys to a public repo.
  - Use environment variables or `.gitignore` for production apps.
  - For GitHub Pages (static), this is unavoidable — keep your Firebase security rules tight.

---

## 💡 TIPS

- **First login**: Use Google Sign-In or create an account in Firebase Console (Authentication → Add user)
- **Change user roles**: Directly in Firestore Console → `users` collection → edit `role` field
- **Font not loading**: Ensure font files are in `assets/fonts/` with the exact filenames in `style.css`
- **Firebase quota**: Free Spark plan allows 50k reads / 20k writes / 20k deletes per day — more than enough for a team dashboard

---

Made with ❤️ using HTML, CSS, JS + Firebase
