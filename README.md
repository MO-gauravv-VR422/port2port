# ⚡ port2port

🧭 A flexible, terminal-based reverse proxy server for local development. Dynamically map URL paths to local ports, rewrite routes, and manage it all from the terminal, with optional config file support.

---

## ✨ Features

- 🔗 **Dynamic proxy routing** (e.g., `/v2>6000`, `/api>3001`, `/v2/app>6000/api`)
- 📁 **Config file support** (`port2port.json` or via `-f` flag)
- 🧠 **Longest prefix match** routing (e.g., `/v2/beta` overrides `/v2`)
- 🔃 **Path rewrite support** (e.g., `/v2>6000/api` rewrites `/v2` → `/api`)
- 🖥️ **Interactive CLI prompt** for adding mappings on the fly
- 📊 **Live-updating table** shows all current path mappings
- 🧪 **WebSocket (`ws`) support**
- ✅ **HTTPS support** (ignores invalid SSL certs)
- 🛠️ **Helpful CLI flags**: `-h`, `-v`, and `-f`
- 💻 **Localhost only**, perfect for dev environments

---

## 📦 Installation

```bash
npm install -g port2port
````

---

## 🛠️ Usage

```bash
port2port
```

You’ll be prompted for a **host port** (e.g., `4000`), and then you can type:

* A port to map `/`:

  ```
  5000
  ```
* A path-to-port:

  ```
  /v2>5000
  ```
* A path-to-port with rewrite:

  ```
  /v2/app>6000/api
  ```

You’ll see a **live table** of active mappings.

---

## 📁 Config File Support

### 🔍 Auto-loads from `port2port.json` (if present):

```json
{
  "mappings": {
    "/v2": 5000,
    "/api": { "port": 6000, "rewrite": "/newapi" },
    "/": 4000
  }
}
```

### 📂 Or specify your own file:

```bash
port2port -f my-mappings.json
```

---

## 🧰 CLI Flags

| Flag      | Description                           |
| --------- | ------------------------------------- |
| `-h`      | Show help / usage                     |
| `-v`      | Show version                          |
| `-f` FILE | Load mappings from a JSON config file |

---

## 🔁 Example

```bash
$ port2port -f dev.json

✅ Loaded mappings from dev.json
⚙️ Proxy server running at: http://localhost:4000

🔁 Current Path Mappings:
┌────────────┬────────────────────────────────────────────┐
│ Path       │ → Proxy To                                 │
├────────────┼────────────────────────────────────────────┤
│ /v2        │ http://localhost:5000                      │
│ /api       │ http://localhost:6000 (rewrite: /newapi)   │
│ /          │ http://localhost:4000                      │
└────────────┴────────────────────────────────────────────┘
```

---

## 🧪 Tips

* Path mappings are **live**, and you can type more after startup.
* Overlapping paths use **longest match** for precision.
* HTTPS targets are supported, even with self-signed certs.

---

## 🧑‍💻 Ideal For

* Testing microservices locally
* Proxying frontend apps to multiple backends
* Rewriting paths during development

---

## 📄 License

MIT © 2025 \[Motilal Oswal]
