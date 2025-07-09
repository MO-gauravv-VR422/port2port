# port2port

🧭 A simple terminal-based reverse proxy server for development that allows dynamic path-to-port mapping. Automatically forwards requests based on defined path mappings and shows them in a live-updating table in your terminal.

---

## ✨ Features

- 🔗 Dynamic proxy routing (e.g., `/v2>6000`, `/api>3001`)
- 🧠 Longest prefix match logic (e.g., `/v2/beta` overrides `/v2`)
- 📊 Terminal table shows live mapping updates
- 🖥️ Interactive CLI prompt
- 🔁 Rewrites entire terminal after each input
- 🧪 Supports WebSocket (`ws: true`) connections
- 💻 Localhost-only, perfect for dev environments

---

## 🚀 Installation

```bash
npm install -g port2port
