
---

# ⚡ port2port

🧭 A flexible, terminal-based reverse proxy server for local development. Now with **Subdomain Support**! Dynamically map **subdomains** & **URL paths** to local ports or external URLs, rewrite routes, and manage it all from the terminal or config file.

![port2port](port2port.png)

---

## ✨ Features

* 🔗 **Dynamic proxy routing** (`/v2>6000`, `/api>3001`, `/v2/app>6000/api`)
* 🌐 **Subdomain Support** (`@aif>3032`, `@pms>/pms>3022`)
* 📁 **Config file support** (`port2port.json` or via `-f` flag)
* 🧠 **Longest prefix match** routing (e.g., `/v2/beta` overrides `/v2`)
* 🔃 **Path rewrite support** (`/v2>6000/api` rewrites `/v2` → `/api`)
* 🖥️ **Interactive CLI prompt** for adding mappings on the fly
* 📊 **Live-updating table** with subdomain & path mappings
* 🧪 **WebSocket (`ws`) support**
* ✅ **HTTPS support** (ignores invalid SSL certs)
* 🛠️ **Helpful CLI flags**: `-h`, `-v`, and `-f`
* 💻 **Localhost only**, perfect for dev environments

---

## 📦 Installation

```bash
npm install -g port2port
```

---

## 🛠️ Usage

### **Start the proxy server**

```bash
port2port
```

You’ll be prompted for a **host port** (default `4000`).

---

### **Interactive CLI (On-the-fly Mappings)**

#### **Basic Usage**

* Map `/` to a port:

  ```
  5000
  ```
* Map a path to a port:

  ```
  /v2>5000
  ```
* Path with rewrite:

  ```
  /v2/app>6000/api
  ```

#### **Subdomain Usage**

* Map a subdomain root to a port:

  ```
  @aif>3032
  ```

  → `http://aif.localhost:4000`

* Map a subdomain path with rewrite:

  ```
  @pms>/pms>3022/api
  ```

  → `http://pms.localhost:4000/pms/login`

* Map a subdomain directly to an external URL:

  ```
  @external>https://api.example.com/v1
  ```

---

## 📁 Config File Support

### **Auto-load from `port2port.json`**

```json
{
  "port": 5000,
  "mappings": {
    "@mf": {
      "/": { "port": 3000, "description": "http://mf.localhost:5000" },
      "/mutualfund": { "port": 3001, "rewrite": "/mutualfund" },
      "/api": { "port": 3001, "rewrite": "/api" }
    },
    "@pms": {
      "/": { "port": 3021 },
      "/pms": { "port": 3022, "rewrite": "/pms" },
      "/api": { "port": 3022, "rewrite": "/api" }
    },
    "/": 4000
  }
}
```

### **Custom File**

```bash
port2port -f my-mappings.json
```

---

## 🔁 Example Output (With Subdomains)

```
⚙️ Proxy server running at: http://localhost:5000

🔁 Current Path Mappings:
┌─────────┬────────────┬───────────────┬───────────────────────────────────────────────┬──────────────────────────────────────────────┬────────┐
│ (index) │ Subdomain  │ Path          │ → Proxy To                                    │ Description                                  │ Status │
├─────────┼────────────┼───────────────┼───────────────────────────────────────────────┼──────────────────────────────────────────────┼────────┤
│ 0       │ mf         │ /mutualfund   │ http://localhost:3001 (rewrite: /mutualfund)  │ http://mf.localhost:5000/mutualfund/login    │ ✅     │
│ 1       │ aif        │ /aif          │ http://localhost:3032 (rewrite: /aif)         │ http://aif.localhost:5000/aif/login          │ ✅     │
│ 2       │ pms        │ /pms          │ http://localhost:3022 (rewrite: /pms)         │ http://pms.localhost:5000/pms/login          │ ⚪️     │
└─────────┴────────────┴───────────────┴───────────────────────────────────────────────┴──────────────────────────────────────────────┴────────┘
```

---

## 🧰 CLI Flags

| Flag      | Description                           |
| --------- | ------------------------------------- |
| `-h`      | Show help / usage                     |
| `-v`      | Show version                          |
| `-f` FILE | Load mappings from a JSON config file |

---

## 🧪 Tips

* Subdomains are accessible via `http://<subdomain>.localhost:<host-port>`
* Longest path match ensures precise routing.
* Supports HTTPS & WebSockets.

---

## 🧑‍💻 Ideal For

* Running multiple projects locally on different subdomains.
* Testing microservices with clean URL separation.
* Switching between local & external APIs seamlessly.

---

## 📄 License

MIT © 2025

---