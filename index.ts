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
import fs from 'fs';
import path from 'path';
import { version } from './package.json';
import { isPortLivePingChecker } from './helpers/pinger';
import { renderScreen } from './helpers/table-renderer';

process.env.NODE_OPTIONS = "--input-type=module"
process.env.NODE_ENV = "development"

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


// Set the readline prompt to the current working directory
setInterval(async () => {
    const updated = await isPortLivePingChecker(subdomains);
    if (updated) renderScreen(rl)(hostPort, subdomains);
}, 5000); // Check every 5 seconds


// Used for storing the initialized proxy connections
const proxyCache = new Map<string, RequestHandler>();
// Used for storing path mappings, passed by user or config file
const mappings = new Map<string, MappedTarget>();
// Used for storing subdomain mappings
const subdomains = {
    ".": new Map<string, MappedTarget>()
}


/* * Function to create a proxy middleware for a given path and target.
 * If the proxy for the given path and target already exists, it uses the cached version.
* Otherwise, it creates a new proxy middleware and stores it in the cache.
*/
const createOrUpdateProxies = (
    cacheKey: string,
    target: string,
    pathRewrite?: Record<string, string>,
) => {

    // Create a new proxy middleware if it doesn't exist in the cache
    if (!proxyCache.has(cacheKey)) {
        const proxy = createProxyMiddleware({
            target,
            changeOrigin: true,
            ws: true,
            logLevel: 'silent',
            pathRewrite,
            selfHandleResponse: false,
            onProxyReq: (proxyReq, req) => {
                if (req.body) {
                    const bodyData = JSON.stringify(req.body);
                    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                    proxyReq.write(bodyData);
                }
            }
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

            if (pathKey.startsWith('@')) {
                // Subdomain handling

                const subdomain = pathKey.slice(1);
                if (!subdomains[subdomain]) {
                    subdomains[subdomain] = new Map<string, MappedTarget>();
                }
                const subdomainMappings = conf || {};

                Object.entries(subdomainMappings).forEach(([subPath, subConf]) => {
                    if (typeof subConf === 'number') {
                        subdomains[subdomain].set(subPath, {
                            port: subConf, rewrite: null, description: null
                        });
                    } else if (typeof subConf === 'object') {
                        if (subConf.target) {
                            subdomains[subdomain].set(subPath, {
                                target: subConf.target,
                                description: subConf.description || null
                            });
                        } else if (subConf.port) {
                            subdomains[subdomain].set(subPath, {
                                port: subConf.port, rewrite: subConf.rewrite || null,
                                description: subConf.description || null
                            });
                        }
                    } else if (typeof subConf === 'string') {
                        subdomains[subdomain].set(subPath, { target: subConf, description: null });
                    }
                })

            } else if (pathKey.startsWith('/')) {
                // If the subdomain is ".", we treat it as the default subdomain

                if (typeof conf === 'number') {
                    subdomains["."].set(pathKey, { port: conf, rewrite: null, description: null });
                } else if (typeof conf === 'object') {
                    if (conf.target) {
                        subdomains["."].set(pathKey, {
                            target: conf.target,
                            description: conf.description || null
                        });
                    } else if (conf.port) {
                        subdomains["."].set(pathKey, {
                            port: conf.port, rewrite: conf.rewrite || null,
                            description: conf.description || null
                        });
                    }
                } else if (typeof conf === 'string') {
                    subdomains["."].set(pathKey, { target: conf, description: null });
                }

            } else {
                console.warn(`❌ Invalid path "${pathKey}" in config file. Must start with '/' or '@'`);
                continue;
            }
        }
        console.log(`✅ Loaded mappings from ${configFile}`);
    }

    for (const subdomain of Object.keys(subdomains)) {
        // Load mappings to the cache
        for (const [inputPath, conf] of subdomains[subdomain].entries()) {
            const cacheKey = `${subdomain}-${inputPath}->${conf.target || conf.port}`;
            if (conf.target) {
                createOrUpdateProxies(cacheKey, conf.target);
            } else if (conf.port) {
                createOrUpdateProxies(cacheKey, `http://localhost:${conf.port}`, {
                    [`^${inputPath}`]: conf.rewrite || '/'
                });
            }
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

        // --- Subdomain matching ---
        const hostHeader = req.headers.host || '';
        const subdomainMatch = hostHeader.match(/^([^.]+)\.localhost/i);

        let subdomain = '.';
        if (subdomainMatch && subdomainMatch[1] !== 'www') {
            subdomain = subdomainMatch[1];
        }

        const matchedEntry = [...subdomains[subdomain].entries()]
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

        const cacheKey = `${subdomain}-${inputPath}->${target}`;

        // console.log({ subdomain, matchedEntry })
        // console.log({ inputPath, target, pathRewrite, cacheKey });
        deleteProxy(app, inputPath);
        createOrUpdateProxies(cacheKey, target, pathRewrite);

        // Call the cached proxy handler
        return proxyCache.get(cacheKey)!(req, res, next);
    });


    app.listen(HOST_PORT, () => {
        isPortLivePingChecker(subdomains).then((updated) => {
            if (updated) renderScreen(rl)(HOST_PORT, subdomains);
        });
        renderScreen(rl)(HOST_PORT, subdomains);
        rl.prompt();
    });

    rl.on('line', (input) => {
        const trimmed = input.trim();

        // Subdomain CLI: @subdomain>port or @subdomain>port/rewrite or @subdomain>fullURL
        const subdomainUrlMatch = trimmed.match(/^@([a-zA-Z0-9_-]+)>(https?:\/\/|wss?:\/\/|ftps?:\/\/|ftp:\/\/)(.+)$/);
        if (subdomainUrlMatch) {
            const subdomain = subdomainUrlMatch[1];
            const protocol = subdomainUrlMatch[2];
            const target = protocol + subdomainUrlMatch[3];
            subdomains[subdomain].set("/", { target });
            renderScreen(rl)(HOST_PORT, subdomains);
            return;
        }

        const subdomainPatternMatch = trimmed.match(/^@([a-zA-Z0-9/_-]+)>(\d{2,5})(\/.*)?$/);
        if (subdomainPatternMatch) {
            const subdomain = subdomainPatternMatch[1];
            const port = parseInt(subdomainPatternMatch[2], 10);
            const rewrite = subdomainPatternMatch[3] ? subdomainPatternMatch[3].trim() : null;
            subdomains[subdomain].set("/", { port, rewrite });
            renderScreen(rl)(HOST_PORT, subdomains);
            return;
        }

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
                subdomains["."].set(inputPath, { target });
            }
            renderScreen(rl)(HOST_PORT, subdomains);
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
                subdomains["."].set(inputPath, { port, rewrite });
            }
            renderScreen(rl)(HOST_PORT, subdomains);
            return;
        }

        // Case: if the user passed just port
        const portOnly = parseInt(trimmed, 10);
        if (!isNaN(portOnly) && portOnly > 0 && portOnly < 65536) {
            subdomains["."].set('/', { port: portOnly, rewrite: null });
            deleteProxy(app, '/');
            renderScreen(rl)(HOST_PORT, subdomains);
            return;
        }

        console.log(`❌ Invalid input: "${trimmed}"`);
        rl.prompt();
    });
});
