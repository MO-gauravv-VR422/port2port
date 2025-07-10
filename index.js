#!/usr/bin/env node

// ╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━━╮
// ╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭╮╭╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭╮╭╮┃
// ╱┃╰━╯┃╱┃┃╱┃┃╱┃╰━╯┃╱╰╯┃┃╰╯╱╰╯╭╯┃╱┃╰━╯┃╱┃┃╱┃┃╱┃╰━╯┃╱╰╯┃┃╰╯
// ╱┃╭━━╯╱┃┃╱┃┃╱┃╭╮╭╯╱╱╱┃┃╱╱╱╭━╯╭╯╱┃╭━━╯╱┃┃╱┃┃╱┃╭╮╭╯╱╱╱┃┃╱╱
// ╱┃┃╱╱╱╱┃╰━╯┃╱┃┃┃╰╮╱╱╱┃┃╱╱╱┃╰━━╮╱┃┃╱╱╱╱┃╰━╯┃╱┃┃┃╰╮╱╱╱┃┃╱╱
// ╱╰╯╱╱╱╱╰━━━╯╱╰╯╰━╯╱╱╱╰╯╱╱╱╰━━━╯╱╰╯╱╱╱╱╰━━━╯╱╰╯╰━╯╱╱╱╰╯╱╱

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import readline from 'readline';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');

// --- CLI Flags ---
const args = process.argv.slice(2);
const fileFlagIndex = args.findIndex(a => a === '-f');
const configFile = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : 'port2port.json';

if (args.includes('-h') || args.includes('--help')) {
    console.log(`
🧰  Dynamic port2port

Usage:
  $ port2port                 Start the proxy server (asks for host port)
  $ port2port -f file.json    Load mapping config from custom JSON file
  $ port2port -h | --help     Show help
  $ port2port -v | --version  Show version

JSON Format:
  {
    "mappings": {
        "/v2": 5000,
        "/api": { "port": 6000, "rewrite": "/v3" },
        "/api/v1": "https://external.com/v1",
        "/chat": { "target": "wss://ws.remotehost.com/socket" }
    }
  }
`);
    process.exit(0);
}

if (args.includes('-v') || args.includes('--version')) {
    console.log(`port2port version: ${version}`);
    process.exit(0);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: '🔗 Enter `path>port/rewrite?` or just `port` (e.g., /v2>6000/api or 5000): '
});

const proxyCache = new Map();
const mappings = new Map();

// Load config file if exists
try {
    const configPath = path.resolve(process.cwd(), configFile);
    if (fs.existsSync(configPath)) {
        const json = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const loadedMappings = json?.mappings || {};
        for (const [pathKey, conf] of Object.entries(loadedMappings)) {
            if (typeof conf === 'number') {
                mappings.set(pathKey, { port: conf, rewrite: null });
            } else if (typeof conf === 'object') {
                if (conf.target) {
                    mappings.set(pathKey, { target: conf.target });
                } else if (conf.port) {
                    mappings.set(pathKey, { port: conf.port, rewrite: conf.rewrite || null });
                }
            } else if (typeof conf === 'string') {
                mappings.set(pathKey, { target: conf });
            }
        }
        console.log(`✅ Loaded mappings from ${configFile}`);
    }
} catch (err) {
    console.error(`❌ Failed to read ${configFile}: ${err.message}`);
    process.exit(1);
}

rl.question('Enter hosting port (default 4000): ', (answer) => {
    const HOST_PORT = parseInt(answer.trim(), 10) || 4000;
    const app = express();

    app.use((req, res, next) => {
        const matchedEntry = [...mappings.entries()]
            .sort((a, b) => b[0].length - a[0].length)
            .find(([path]) => req.path.startsWith(path));

        if (!matchedEntry) {
            return res.status(502).send(`❌ No proxy mapping found for ${req.path}`);
        }

        const [inputPath, conf] = matchedEntry;

        let target;
        let pathRewrite;

        if (conf.target) {
            target = conf.target;
            const basePath = conf.target.replace(/^(https?:|wss?:|ftps?:|ftp:)\/\/[^/]+/, '') || '/';
            pathRewrite = { [`^${inputPath}`]: basePath };
        } else {
            target = `http://localhost:${conf.port}`;
            pathRewrite = conf.rewrite ? { [`^${inputPath}`]: conf.rewrite } : undefined;
        }

        const cacheKey = `${inputPath}->${target}`;

        if (!proxyCache.has(cacheKey)) {
            const proxy = createProxyMiddleware({
                target,
                changeOrigin: true,
                ws: true,
                logLevel: 'silent',
                pathRewrite
            });
            proxyCache.set(cacheKey, proxy);
        }
        return proxyCache.get(cacheKey)(req, res, next);
    });

    app.listen(HOST_PORT, () => {
        renderScreen(HOST_PORT);
        rl.prompt();
    });

    const renderScreen = (PORT) => {
        console.clear();
        console.log(`⚙️ Proxy server running at: http://localhost:${PORT}`);
        console.log('📥 Instructions:');
        console.log('  - Type a port (e.g., 5000) to map root path "/"');
        console.log('  - Type a path>port or path>port/rewrite or path>fullURL to map custom paths\n');

        if (mappings.size === 0) {
            console.log('🔁 No path mappings yet.');
        } else {
            console.log('🔁 Current Path Mappings:');
            console.table(
                Array.from(mappings.entries()).map(([path, conf]) => {
                    if (conf.target) {
                        return { Path: path, '→ Proxy To': conf.target };
                    } else {
                        return {
                            Path: path,
                            '→ Proxy To': `http://localhost:${conf.port}${conf.rewrite ? ` (rewrite: ${conf.rewrite})` : ''}`
                        };
                    }
                })
            );
        }
        rl.prompt();
    };

    rl.on('line', (input) => {
        const trimmed = input.trim();

        const urlMatch = trimmed.match(/^(.+?)>(https?:\/\/|wss?:\/\/|ftps?:\/\/|ftp:\/\/)(.+)$/);
        if (urlMatch) {
            const inputPath = urlMatch[1].trim();
            const protocol = urlMatch[2];
            const target = protocol + urlMatch[3];

            if (!inputPath.startsWith('/')) {
                console.log(`❌ Invalid path: "${inputPath}". Must start with '/'`);
            } else {
                mappings.set(inputPath, { target });
            }
            renderScreen(HOST_PORT);
            return;
        }

        const match = trimmed.match(/^(.+?)>(\d{2,5})(\/.*)?$/);
        if (match) {
            const inputPath = match[1].trim();
            const port = parseInt(match[2], 10);
            const rewrite = match[3] ? match[3].trim() : null;

            if (!inputPath.startsWith('/')) {
                console.log(`❌ Invalid path: "${inputPath}". Must start with '/'`);
            } else {
                mappings.set(inputPath, { port, rewrite });
            }
            renderScreen(HOST_PORT);
            return;
        }

        const portOnly = parseInt(trimmed, 10);
        if (!isNaN(portOnly) && portOnly > 0 && portOnly < 65536) {
            mappings.set('/', { port: portOnly, rewrite: null });
            renderScreen(HOST_PORT);
            return;
        }

        console.log(`❌ Invalid input: "${trimmed}"`);
        rl.prompt();
    });
});
