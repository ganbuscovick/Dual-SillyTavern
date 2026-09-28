# ✨ Dual SillyTavern

> **Two SillyTavern workspaces. One tab.**

Dual SillyTavern lets you open **two SillyTavern interfaces side by side inside a single browser tab**.

It is designed for situations where two separate chats, characters, or workspace states need to stay visible at the same time — without constantly switching between browser tabs.

---

## 🌟 What does it do?

When Dual SillyTavern is opened, it creates two panes:

```text
┌─────────────────────────────────────────────────────────────┐
│                    ✨ Dual SillyTavern                     │
├───────────────────────────┬─────────────────────────────────┤
│       SillyTavern A       │        SillyTavern B            │
│                           │                                 │
│       Workspace A         │        Workspace B              │
│                           │                                 │
└───────────────────────────┴─────────────────────────────────┘
```

Each pane keeps its own browser-side SillyTavern state, so A and B can be used independently during the same Dual session.

### You can use different

| A | B |
|---|---|
| Character | Character |
| Chat | Chat |
| Client-side settings | Client-side settings |
| Active UI state | Active UI state |

The two panes still use the same SillyTavern installation and server underneath.

---

## 🚀 Getting started

After installation:

1. Open **SillyTavern**.
2. Open the **Extensions** panel.
3. Find **Dual SillyTavern**.
4. Press **Open Dual SillyTavern**.
5. Use both panes normally.

That's it.

---

## 🎛️ Controls

Dual keeps the interface simple and puts the useful controls in the top bar.

| Control | Action |
|---|---|
| **↔ / ↕** | Switch between horizontal and vertical layouts |
| **⟳** | Reset the saved Dual session state |
| **↻** on A or B | Reload that pane only |
| **×** | Close Dual |
| **Esc** | Close Dual from the keyboard |
| **Divider** | Drag to resize A and B |

The initial split is **50 / 50**.

The divider can be moved between approximately **20 / 80** and **80 / 20**.

---

## 🧠 How it works

Dual SillyTavern runs as a **client-side SillyTavern extension**.

Instead of starting another SillyTavern server, it opens two copies of the current SillyTavern interface and gives each pane its own isolated browser-side namespace for the state that would normally be shared by the page.

This covers the main client-side storage and communication mechanisms used by SillyTavern, including:

- `localStorage`
- `sessionStorage`
- IndexedDB
- Cache Storage
- `BroadcastChannel`
- client-side SillyTavern settings
- active character/chat pointers

This is what allows the two panes to keep different client-side states while remaining inside the same browser tab.

---

## 💬 Chats

A and B can normally work with different chats at the same time.

There is one important rule:

> **Do not actively edit the exact same physical chat from both panes at once.**

Dual detects conflicting operations on the same chat and blocks the write instead of allowing both panes to silently overwrite each other.

For normal use, simply keep a different chat open in each pane.

```text
A → Character 1 → Chat A
B → Character 2 → Chat B
```

---

## 🔄 Resetting the session

Dual stores its temporary A/B state for the current browser session.

To clear that state:

**Extensions → Dual SillyTavern → Reset isolated session state**

Then close and reopen Dual.

This is useful when starting over with fresh A/B client state.

---

## 📦 Installation from GitHub

Dual can be installed directly through SillyTavern's third-party extension installer.

### 1. Open the extension installer

Go to:

**Extensions → Install Extension**

### 2. Enter the Git repository URL

Paste the URL of this GitHub repository.

```text
https://github.com/ganbuscovick/Dual-SillyTavern
```

### 3. Install

Press **Install** and wait for SillyTavern to load the extension.

### 4. Open Dual

Return to the Extensions panel and press:

**Open Dual SillyTavern**

---

## 🛠️ Manual installation

The extension files can also be copied manually into SillyTavern's third-party extensions directory:

```text
public/
└── scripts/
    └── extensions/
        └── third-party/
            └── dual-sillytavern/
                ├── manifest.json
                ├── index.js
                ├── bootstrap.js
                ├── style.css
                ├── README.md
                ├── CHANGELOG.md
                └── LICENSE.txt
```

After copying the files, reload SillyTavern.

---

## 📱 Desktop & Mobile

Dual SillyTavern is intended for both **desktop and mobile browsers**.

The interface can be switched between horizontal and vertical layouts to make better use of different screen sizes.

For narrow mobile screens, the **vertical layout** is often more comfortable.

---

## 📁 Project structure

```text
manifest.json   → Extension metadata
index.js        → Main Dual interface and controls
bootstrap.js    → A/B client-state isolation
style.css       → Interface styling
CHANGELOG.md    → Version history
LICENSE.txt     → MIT License
README.md       → Documentation
```

---

## 📌 Version

**v0.1.0**

Initial public release.

---

## 📝 About this project

I made this project through **vibecoding**, and I do not plan to release further updates.

---

## 📄 License

Released under the **MIT License**.

See [`LICENSE.txt`](./LICENSE.txt) for the full license text.

---

<p align="center">
  <b>✨ Dual SillyTavern</b><br>
  Two workspaces. One tab.
</p>
