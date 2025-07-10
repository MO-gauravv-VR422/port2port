#!/usr/bin/env node

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import readline from 'readline';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Ignore SSL certs

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: '🔗 Enter `path>port/rewrite?` or just `port` (e.g., /v2>6000/api or 5000): ',
});

const proxyCache = new Map(); // cacheKey → proxyMiddleware
const mappings = new Map();   // pathPrefix → { port, rewrite }

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

        const [inputPath, { port, rewrite }] = matchedEntry;
        const cacheKey = `${inputPath}->${port}${rewrite ? rewrite : ''}`;

        if (!proxyCache.has(cacheKey)) {
            const proxy = createProxyMiddleware({
                target: `http://localhost:${port}`,
                changeOrigin: true,
                ws: true,
                logLevel: 'silent',
                pathRewrite: rewrite ? {
                    [`^${inputPath}`]: rewrite
                } : undefined
            });
            proxyCache.set(cacheKey, proxy);
        }

        return proxyCache.get(cacheKey)(req, res, next);
    });

    app.listen(HOST_PORT, () => {
        renderScreen(HOST_PORT, mappings);
        rl.prompt();
    });

    const renderScreen = (PORT, map) => {
        console.clear();
        console.log(`⚙️ Proxy server running at: http://localhost:${PORT}`);
        console.log('📥 Instructions:');
        console.log('  - Type a port (e.g., 5000) to map root path "/"');
        console.log('  - Type a path>port or path>port/rewrite to map custom paths\n');

        if (map.size === 0) {
            console.log('🔁 No path mappings yet.');
        } else {
            console.log('🔁 Current Path Mappings:');
            console.table(
                Array.from(map.entries()).map(([path, { port, rewrite }]) => ({
                    Path: path,
                    '→ Proxy To': `http://localhost:${port}${rewrite ? ` (rewrite: ${rewrite})` : ''}`,
                }))
            );
        }
        rl.prompt();
    };

    rl.on('line', (input) => {
        const trimmed = input.trim();

        // Matches inputs like: /v2>6000 or /v2/max>8000/api
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

            renderScreen(HOST_PORT, mappings);
            return;
        }

        // Handle: just "5000"
        const portOnly = parseInt(trimmed, 10);
        if (!isNaN(portOnly) && portOnly > 0 && portOnly < 65536) {
            mappings.set('/', { port: portOnly, rewrite: null });
            renderScreen(HOST_PORT, mappings);
            return;
        }

        console.log(`❌ Invalid input: "${trimmed}"`);
        rl.prompt();
    });
});
