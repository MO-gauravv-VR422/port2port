#!/usr/bin/env node

// ╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━╮╱╭━━━━╮
// ╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭╮╭╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭━╮┃╱┃╭╮╭╮┃
// ╱┃╰━╯┃╱┃┃╱┃┃╱┃╰━╯┃╱╰╯┃┃╰╯╱╰╯╭╯┃╱┃╰━╯┃╱┃┃╱┃┃╱┃╰━╯┃╱╰╯┃┃╰╯
// ╱┃╭━━╯╱┃┃╱┃┃╱┃╭╮╭╯╱╱╱┃┃╱╱╱╭━╯╭╯╱┃╭━━╯╱┃┃╱┃┃╱┃╭╮╭╯╱╱╱┃┃╱╱
// ╱┃┃╱╱╱╱┃╰━╯┃╱┃┃┃╰╮╱╱╱┃┃╱╱╱┃╰━━╮╱┃┃╱╱╱╱┃╰━╯┃╱┃┃┃╰╮╱╱╱┃┃╱╱
// ╱╰╯╱╱╱╱╰━━━╯╱╰╯╰━╯╱╱╱╰╯╱╱╱╰━━━╯╱╰╯╱╱╱╱╰━━━╯╱╰╯╰━╯╱╱╱╰╯╱╱

import express from 'express';
import * as core from "express-serve-static-core";
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import readline from 'readline';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
import { version } from './package.json';

// --- CLI Flags ---
const args = process.argv.slice(2);
const fileFlagIndex = args.findIndex(a => a === '-f');
const configFile = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : 'port2port.json';
let hostPort = 4000;

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
        "/": 5000,
        "/v2": { "port": 5000, "rewrite": null },
        "/api": { "port": 6000, "rewrite": "/v3" },
        "/chat": { "target": "https://external.com/v1" }
    }
  }
`);
    process.exit(0);
}

if (args.includes('-v') || args.includes('--version')) {
    console.log(`port2port version: ${version}`);
    process.exit(0);
}

// Used for ignoring SSL certificate errors (not recommended for production)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: '🔗 Enter `path>port/rewrite?` or just `port` (e.g., /v2>6000/api or 5000): '
});


/**
 * Renders the main screen for the proxy server.
 * @param PORT Hosting port for the proxy server
 * @param mappings Map of path mappings
 */
const renderScreen = (PORT: number, mappings: Map<string, MappedTarget>) => {
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
                        '→ Proxy To': `http://localhost:${conf.port}${conf.rewrite
                            ? ` (rewrite: ${conf.rewrite})` : ''}`
                    };
                }
            })
        );
    }
    rl.prompt();
};

// Used for storing the initialized proxy connections
const proxyCache = new Map<string, RequestHandler>();
// Used for storing path mappings, passed by user or config file
const mappings = new Map<string, MappedTarget>();


/* * Function to create a proxy middleware for a given path and target.
 * If the proxy for the given path and target already exists, it uses the cached version.
* Otherwise, it creates a new proxy middleware and stores it in the cache.
*/
const createOrUpdateProxies = (
    inputPath: string,
    target: string,
    pathRewrite?: Record<string, string>
) => {
    const cacheKey = `${inputPath}->${target}`;

    // Create a new proxy middleware if it doesn't exist in the cache
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
}


/**
 * Deletes a proxy middleware for a given path from the Express app.
 * It filters out the middleware that matches the specified route path.
 * @param app The Express application instance
 * @param routePath The path for which the proxy should be removed
 */
function deleteProxy(app: core.Express, routePath: string) {
    // console.log(`🗑️ Removing proxy for path: ${routePath}`);

    app._router.stack = app._router.stack.filter((layer: any) => {
        // 1. Match normal routes (app.get/post etc.)
        if (layer.route && layer.route.path === routePath) {
            return false;
        }

        // 2. Match middleware (like app.use) based on regexp
        if (layer.name === "router" || layer.name === "bound dispatch" || layer.handle?.name === "proxy") {
            if (layer.regexp) {
                const pathRegex = new RegExp(`^\\${routePath}(?:\\/|$)`);
                if (pathRegex.test(layer.regexp.toString())) {
                    return false;
                }
            }
        }

        return true;
    });
}


// Load config file if exists
try {
    const configPath = path.resolve(process.cwd(), configFile);
    if (fs.existsSync(configPath)) {
        const json = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ConfigFile;
        const loadedMappings = json?.mappings || {};
        hostPort = json?.port || hostPort;

        // Iterate over the loaded mappings and populate the mappings Map
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

    // Load mappings to the cache
    for (const [inputPath, conf] of mappings.entries()) {
        if (conf.target) {
            createOrUpdateProxies(inputPath, conf.target);
        } else if (conf.port) {
            createOrUpdateProxies(inputPath, `http://localhost:${conf.port}`, {
                [`^${inputPath}`]: conf.rewrite || '/'
            });
        }
    }
} catch (err) {
    console.error(`❌ Failed to read ${configFile}: ${err.message}`);
    process.exit(1);
}


rl.question(`Enter hosting port (default ${hostPort}): `, (answer) => {
    const HOST_PORT = parseInt(answer.trim(), 10) || hostPort;
    const app = express();

    // Add a middleware to handle the proxying based on the mappings
    app.use((req, res, next) => {
        const matchedEntry = [...mappings.entries()]
            .sort((a, b) => b[0].length - a[0].length)
            .find(([path]) => req.path.startsWith(path));

        if (!matchedEntry) {
            return res.status(502).send(`❌ No proxy mapping found for ${req.path}`);
        }

        const [inputPath, conf] = matchedEntry;

        let target: string;
        let pathRewrite: Record<string, string> | undefined;

        // if (conf.target) {
        //     target = conf.target;
        //     const basePath = conf.target.replace(/^(https?:|wss?:|ftps?:|ftp:)\/\/[^/]+/, '') || '/';
        //     pathRewrite = { [`^${inputPath}`]: basePath };
        // } 

        if (conf.target) {
            const targetUrl = new URL(conf.target);
            target = `${targetUrl.protocol}//${targetUrl.host}`;
            const newPath = targetUrl.pathname.endsWith('/')
                ? targetUrl.pathname.slice(0, -1)
                : targetUrl.pathname;

            pathRewrite = { [`^${inputPath}`]: newPath || '/' };
        } else {
            target = `http://localhost:${conf.port}`;
            pathRewrite = conf.rewrite ? { [`^${inputPath}`]: conf.rewrite } : undefined;
        }

        const cacheKey = `${inputPath}->${target}`;

        deleteProxy(app, inputPath);
        createOrUpdateProxies(inputPath, target, pathRewrite);

        // Call the cached proxy handler
        return proxyCache.get(cacheKey)!(req, res, next);
    });


    app.listen(HOST_PORT, () => {
        renderScreen(HOST_PORT, mappings);
        rl.prompt();
    });

    rl.on('line', (input) => {
        const trimmed = input.trim();

        // Case: if the user passed url with path
        const urlMatch = trimmed.match(/^(.+?)>(https?:\/\/|wss?:\/\/|ftps?:\/\/|ftp:\/\/)(.+)$/);
        if (urlMatch) {
            const inputPath = urlMatch[1].trim();
            const protocol = urlMatch[2];
            const target = protocol + urlMatch[3];

            if (!inputPath.startsWith('/')) {
                console.log(`❌ Invalid path: "${inputPath}". Must start with '/'`);
            } else {
                deleteProxy(app, inputPath);
                mappings.set(inputPath, { target });
            }
            renderScreen(HOST_PORT, mappings);
            return;
        }

        // Case: if the user passed path>port/rewrite
        const patternMatch = trimmed.match(/^(.+?)>(\d{2,5})(\/.*)?$/);
        if (patternMatch) {
            const inputPath = patternMatch[1].trim();
            const port = parseInt(patternMatch[2], 10);
            const rewrite = patternMatch[3] ? patternMatch[3].trim() : null;

            if (!inputPath.startsWith('/')) {
                console.log(`❌ Invalid path: "${inputPath}". Must start with '/'`);
            } else {
                deleteProxy(app, inputPath);
                mappings.set(inputPath, { port, rewrite });
            }
            renderScreen(HOST_PORT, mappings);
            return;
        }

        // Case: if the user passed just port
        const portOnly = parseInt(trimmed, 10);
        if (!isNaN(portOnly) && portOnly > 0 && portOnly < 65536) {
            mappings.set('/', { port: portOnly, rewrite: null });
            deleteProxy(app, '/');
            renderScreen(HOST_PORT, mappings);
            return;
        }

        console.log(`❌ Invalid input: "${trimmed}"`);
        rl.prompt();
    });
});
