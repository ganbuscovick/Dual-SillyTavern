# ✨ Dual SillyTavern

> **Two SillyTavern interfaces. One browser tab.**

I made **Dual SillyTavern** for the times when I want to have two full SillyTavern workspaces open at the same time without keeping two normal browser tabs side-by-side.

Dual puts **SillyTavern A** and **SillyTavern B** into the same page and gives each side its own client-side state. I can move between characters, chats, settings, and other UI state on each side without the two panes constantly following each other.

---

## 🌟 What I get

With Dual open, I get two complete SillyTavern interfaces:

```text
┌──────────────────────────────────────────────────────────────┐
│                 ✨ Dual SillyTavern                         │
├───────────────────────────┬──────────────────────────────────┤
│        SillyTavern A      │          SillyTavern B            │
│                           │                                  │
│       My workspace        │       My second workspace        │
│                           │                                  │
└───────────────────────────┴──────────────────────────────────┘
```

I can then:

- use different characters on A and B;
- use different chats on A and B;
- keep different SillyTavern settings on each side during the Dual session;
- resize the two panes with the draggable divider;
- switch between horizontal and vertical layouts;
- reload A or B independently;
- reset the saved Dual session state whenever I need a fresh start.

The two sides are meant to behave like separate SillyTavern workspaces while sharing the same underlying SillyTavern server.

---

## 🚀 How I use it

After installing Dual, I open the **Extensions** panel in SillyTavern and find **Dual SillyTavern**.

I press:

**Open Dual SillyTavern**

That opens both panes in one overlay.

### The controls

| Control | What I use it for |
|---|---|
| **↔ / ↕** | Switch between horizontal and vertical layouts |
| **⟳** | Clear the saved A/B state for the next launch |
| **↻** next to A or B | Reload only that pane |
| **×** | Close Dual mode |
| **Esc** | Close Dual mode from the keyboard |
| **Divider** | Drag to change the size of A and B |

The split starts at **50/50**, and I can drag it anywhere between roughly **20/80 and 80/20**.

---

## 🧠 How it works

I built Dual as a **client-side extension** rather than starting another SillyTavern server.

When I open Dual, it loads the current SillyTavern interface twice inside the same page. Each pane gets its own client-side namespace for the state that SillyTavern normally keeps in the browser.

That includes things such as:

- `localStorage`
- `sessionStorage`
- IndexedDB
- Cache Storage
- BroadcastChannel names
- SillyTavern settings used by the client
- the active chat pointer for characters

This is what allows A and B to behave independently even though both panes are connected to the same SillyTavern server.

### Chats

I can normally use different chats on A and B at the same time.

There is one important protection: if both panes are pointing at the **same physical chat file**, Dual blocks conflicting save, delete, or rename operations instead of allowing the two panes to silently overwrite each other.

So my normal workflow is simple:

> **A → one chat**  
> **B → another chat**

---

## 📦 Installation from GitHub

I can install Dual directly from its GitHub repository using SillyTavern's built-in third-party extension installer.

SillyTavern's current documentation supports installing third-party extensions from **Extensions → Install Extension** by pasting the Git repository URL. Git must be available to the SillyTavern installation. citeturn677093search0turn677093search1

### Step 1 — Open SillyTavern

I open SillyTavern and go to:

**Extensions → Install Extension**

### Step 2 — Paste my GitHub repository URL

I paste the URL of this repository.

Example:

```text
https://github.com/USERNAME/REPOSITORY
```

### Step 3 — Install

I press **Install** and let SillyTavern download the extension.

### Step 4 — Open Dual

After the extension loads, I open the **Extensions** panel, expand **Dual SillyTavern**, and press **Open Dual SillyTavern**.

---

## 🛠️ Manual installation

I can also install it manually by placing these files in SillyTavern's third-party extension directory:

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

After copying the files, I reload SillyTavern and enable the extension from the Extensions panel.

---

## 🔄 Resetting Dual

If I want to start the two panes from a clean Dual state, I use:

**Reset isolated session state**

Then I close and reopen Dual.

This rebuilds the A/B client state from the current normal SillyTavern page state.

---

## 💡 A simple workflow

My usual setup looks like this:

```text
SillyTavern
      │
      ▼
 Dual SillyTavern
    ┌───────┴───────┐
    ▼               ▼
    A               B
 Character 1      Character 2
 Chat A           Chat B
 Settings A       Settings B
```

This is useful when I want to keep two RP/workspaces visible at once, compare two setups, work on two different chats, or simply avoid switching between separate browser tabs.

---

## ⚠️ A few things I keep in mind

Dual separates the **client-side state** used by the two panes, but both sides still use the same SillyTavern server.

That means server-side resources that SillyTavern normally treats as global are still shared.

The main thing I avoid is editing the exact same physical chat from both panes at the same time. Dual already blocks the conflicting chat write operations when it detects that situation.

---

## 📱 Compatibility

I built Dual around the SillyTavern **1.18.x** client architecture.

It is intended for both **desktop and mobile browsers**, including Android setups where I run SillyTavern locally.

Because Dual works on top of SillyTavern's existing client, future major changes inside SillyTavern can affect compatibility.

---

## 📁 Project files

```text
manifest.json   → SillyTavern extension metadata
index.js        → Main Dual interface and controls
bootstrap.js    → Client-state virtualization for A/B
style.css       → Dual interface styling
CHANGELOG.md    → Release history
LICENSE.txt     → MIT License
README.md       → This guide
```

---

## 📌 Current version

**v0.1.0**

This is my initial Dual SillyTavern release.

I created this project through **vibecoding**, and I am not planning further updates at this time.

---

## 📄 License

I released this project under the **MIT License**.

See [`LICENSE.txt`](./LICENSE.txt) for the full license text.

---

<p align="center">
  <b>✨ Dual SillyTavern</b><br>
  Two workspaces. One tab. Simple.
</p>
