# AMT — Real-Time Chat App

> A full-featured WhatsApp-style messaging app with voice/video calls, group chats, status updates, and AI integration. Built with **Next.js 14**, **Back4App (Parse)**, and **WebRTC**.

---

## Features

- **Authentication** — Register, login, profile photo upload, bio
- **Real-time Messaging** — Text, images, voice notes, files, video
- **Voice & Video Calls** — WebRTC peer-to-peer calls with mute/camera controls
- **Group Chats** — Create groups, add members, group avatar
- **Status Updates** — 24-hour disappearing text/image statuses
- **Contacts** — Search by username or phone, add contacts
- **Dark Mode** — Full light/dark theme support
- **Live Updates** — Parse LiveQuery for real-time message delivery
- **Read Receipts** — Double blue ticks when messages are read
- **Typing Indicators** — Shows when the other person is typing

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript |
| Backend | Back4App (Parse Server) |
| Real-time | Parse LiveQuery (WebSocket) |
| Calls | WebRTC via simple-peer |
| Styling | CSS Variables + Tailwind utilities |
| Deployment | Vercel (frontend) + Back4App (backend) |

---

## Step 1 — Set Up Back4App

### 1.1 Create a Back4App Account
1. Go to [https://www.back4app.com](https://www.back4app.com)
2. Sign up for a free account
3. Click **"Build new app"** → name it **AMT**

### 1.2 Get Your API Keys
1. In your app dashboard, go to **App Settings → Security & Keys**
2. Copy:
   - **Application ID**
   - **JavaScript Key**
   - **Server URL** (usually `https://parseapi.back4app.com`)

### 1.3 Enable LiveQuery
1. Go to **Server Settings → Web Hosting and Live Query**
2. Enable **LiveQuery**
3. Add these classes to LiveQuery: `Message`, `Conversation`, `Signal`, `Status`
4. Note your LiveQuery URL (format: `wss://YOUR-APP-NAME.b4a.io`)

### 1.4 Set Up Database Classes

Go to **Database → Create a class** and create these classes:

#### `Conversation`
| Column | Type | Notes |
|--------|------|-------|
| participants | Array | Array of Pointers to _User |
| participantIds | Array | Array of user ID strings |
| isGroup | Boolean | |
| groupName | String | |
| groupAvatarUrl | String | |
| groupDescription | String | |
| admins | Array | Array of user ID strings |
| lastMessage | Pointer → Message | |
| lastMessageAt | Date | |

#### `Message`
| Column | Type | Notes |
|--------|------|-------|
| sender | Pointer → _User | |
| senderId | String | |
| conversationId | String | |
| content | String | |
| type | String | text/image/audio/video/file |
| fileUrl | String | |
| fileName | String | |
| audioDuration | Number | |
| read | Boolean | Default: false |
| readAt | Date | |
| replyTo | String | Message ID |

#### `Contact`
| Column | Type | Notes |
|--------|------|-------|
| owner | Pointer → _User | |
| contact | Pointer → _User | |
| contactId | String | |

#### `Status`
| Column | Type | Notes |
|--------|------|-------|
| user | Pointer → _User | |
| userId | String | |
| type | String | text/image |
| content | String | |
| bgColor | String | Hex color |
| mediaUrl | String | |
| views | Array | Array of user IDs |
| expiresAt | Date | |

#### `Signal` (for WebRTC)
| Column | Type | Notes |
|--------|------|-------|
| type | String | offer/answer/ice-candidate/call-ended |
| signal | Object | WebRTC signal data |
| callId | String | |
| from | String | User ID |
| to | String | User ID |
| callType | String | audio/video |
| callerName | String | |
| callerAvatar | String | |

#### `Call`
| Column | Type | Notes |
|--------|------|-------|
| callerId | String | |
| callerName | String | |
| callerAvatar | String | |
| receiverId | String | |
| type | String | audio/video |
| status | String | ringing/active/ended/declined/missed |
| roomId | String | |
| startedAt | Date | |
| endedAt | Date | |
| duration | Number | Seconds |

### 1.5 Set Class-Level Permissions (CLPs)

For each class, go to **Security → Class-Level Permissions**:

- **_User**: Public Read ✓, Authenticated Write ✓
- **Conversation**: Authenticated Read ✓, Authenticated Write ✓
- **Message**: Authenticated Read ✓, Authenticated Write ✓
- **Contact**: Authenticated Read ✓, Authenticated Write ✓
- **Status**: Public Read ✓, Authenticated Write ✓
- **Signal**: Authenticated Read ✓, Authenticated Write ✓
- **Call**: Authenticated Read ✓, Authenticated Write ✓

### 1.6 Add User Fields
In **Database → _User**, add these columns:
| Column | Type |
|--------|------|
| displayName | String |
| phone | String |
| bio | String |
| avatarUrl | String |
| online | Boolean |
| lastSeen | Date |

---

## Step 2 — Run Locally

### 2.1 Clone / Download
```bash
git clone https://github.com/YOUR_USERNAME/amt-chat.git
cd amt-chat
```

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Set Environment Variables
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_BACK4APP_APP_ID=your_actual_app_id
NEXT_PUBLIC_BACK4APP_JS_KEY=your_actual_js_key
NEXT_PUBLIC_BACK4APP_SERVER_URL=https://parseapi.back4app.com
NEXT_PUBLIC_BACK4APP_LIVE_QUERY_URL=wss://your-app-name.b4a.io
```

### 2.4 Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🚀

---

## Step 3 — Deploy to GitHub

### 3.1 Create GitHub Repository
1. Go to [https://github.com/new](https://github.com/new)
2. Name it `amt-chat`
3. Keep it **Public** (required for free Vercel)
4. Click **Create repository**

### 3.2 Push Code
```bash
cd amt-chat
git init
git add .
git commit -m "🚀 Initial AMT Chat release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/amt-chat.git
git push -u origin main
```

---

## Step 4 — Deploy to Vercel

### 4.1 Connect to Vercel
1. Go to [https://vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click **"Add New Project"**
4. Select your `amt-chat` repository
5. Click **Import**

### 4.2 Add Environment Variables
In Vercel's project setup, click **"Environment Variables"** and add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_BACK4APP_APP_ID` | Your App ID |
| `NEXT_PUBLIC_BACK4APP_JS_KEY` | Your JS Key |
| `NEXT_PUBLIC_BACK4APP_SERVER_URL` | `https://parseapi.back4app.com` |
| `NEXT_PUBLIC_BACK4APP_LIVE_QUERY_URL` | `wss://your-app-name.b4a.io` |

### 4.3 Deploy
Click **Deploy** — Vercel will build and deploy in ~2 minutes.

Your app will be live at: `https://amt-chat-YOUR_USERNAME.vercel.app`

### 4.4 Auto-Deploys
Every time you push to `main`, Vercel auto-deploys. No manual action needed.

---

## Step 5 — Make It a Mobile App (PWA)

Add this to your `public/manifest.json` to make AMT installable:

```json
{
  "name": "AMT Chat",
  "short_name": "AMT",
  "description": "Real-time messaging, calls & status",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0057FF",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Users on mobile can then **"Add to Home Screen"** to install AMT like a native app.

---

## Project Structure

```
amt-chat/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── page.tsx            # Redirect to /chat or /auth/login
│   │   ├── globals.css         # Global styles + dark mode
│   │   ├── auth/
│   │   │   ├── login/page.tsx  # Login screen
│   │   │   └── register/page.tsx # Register + profile setup
│   │   └── chat/
│   │       └── page.tsx        # Main chat app
│   ├── contexts/
│   │   ├── AuthContext.tsx     # Authentication state
│   │   └── ThemeContext.tsx    # Dark/light mode
│   ├── lib/
│   │   ├── parse.ts            # Back4App/Parse setup & helpers
│   │   └── webrtc.ts          # WebRTC call utilities
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── public/                    # Static assets
├── .env.example               # Environment variables template
├── .gitignore
├── next.config.mjs
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

---

## Troubleshooting

**"LiveQuery connection failed"**
→ Check your `NEXT_PUBLIC_BACK4APP_LIVE_QUERY_URL` is correct and LiveQuery is enabled in Back4App dashboard.

**"Message not sending"**
→ Check Class-Level Permissions — `Message` class must allow Authenticated Write.

**"Camera/mic not working on calls"**
→ WebRTC requires HTTPS. Works locally on `localhost`, requires deployed HTTPS URL in production.

**"User not found when adding contact"**
→ Make sure `_User` class has Public Read access in CLPs.

---

## License

MIT © AMT Team
