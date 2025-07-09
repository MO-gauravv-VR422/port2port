#!/usr/bin/env node

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import readline from 'readline';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Ignore SSL for dev

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: '🔗 Enter `path>port` or `port` (e.g., /v2>6000 or 5000): ',
});

const proxyCache = new Map(); // path → middleware

rl.question('Enter hosting port (default 4000): ', (answer) => {
    const PORT = parseInt(answer.trim(), 10) || 4000;
    const app = express();
    const pathPortMap = new Map(); // path → port

    // Proxy handler
    app.use((req, res, next) => {
        const matchedEntry = [...pathPortMap.entries()]
            .sort((a, b) => b[0].length - a[0].length)
            .find(([path]) => req.path.startsWith(path));

        if (!matchedEntry) {
            return res.status(502).send(`❌ No proxy mapping found for ${req.path}`);
        }

        const [path, port] = matchedEntry;
        const cacheKey = `${path}->${port}`;

        if (!proxyCache.has(cacheKey)) {
            const proxy = createProxyMiddleware({
                target: `http://localhost:${port}`,
                changeOrigin: true,
                ws: true,
                logLevel: 'silent' // ✅ turn off [HPM] logs
            });
            proxyCache.set(cacheKey, proxy);
        }

        return proxyCache.get(cacheKey)(req, res, next);
    });

    app.listen(PORT, () => {
        renderScreen(PORT, pathPortMap);
        rl.prompt();
    });

    const renderScreen = (PORT, mappings) => {
        console.clear();
        console.log(`⚙️ Proxy server running at: http://localhost:${PORT}`);
        console.log('📥 Instructions:');
        console.log('  - Type a port (e.g., 5000) to map root path "/"');
        console.log('  - Type a path>port (e.g., /v2>6000) to map a specific path\n');

        if (mappings.size === 0) {
            console.log('🔁 No path mappings yet.');
        } else {
            console.log('🔁 Current Path Mappings:');
            console.table(
                Array.from(mappings.entries()).map(([path, port]) => ({
                    Path: path,
                    '→ Proxy To': `http://localhost:${port}`,
                }))
            );
        }
        rl.prompt();
    };

    rl.on('line', (input) => {
        const trimmed = input.trim();
        const match = trimmed.match(/^(.+?)\s*>\s*(\d{2,5})$/);

        if (match) {
            const path = match[1].trim();
            const port = parseInt(match[2], 10);

            if (!path.startsWith('/')) {
                console.log(`❌ Invalid path: "${path}". It should start with '/'`);
            } else if (isNaN(port) || port < 1 || port > 65535) {
                console.log(`❌ Invalid port: "${port}"`);
            } else {
                pathPortMap.set(path, port);
            }

            renderScreen(PORT, pathPortMap);
            return;
        }

        const portOnly = parseInt(trimmed, 10);
        if (!isNaN(portOnly) && portOnly > 0 && portOnly < 65536) {
            pathPortMap.set('/', portOnly);
            renderScreen(PORT, pathPortMap);
            return;
        }

        console.log(`❌ Invalid input: "${trimmed}"`);
        rl.prompt();
    });
});
