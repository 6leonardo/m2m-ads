import fastify from 'fastify';
import swagger from '@fastify/swagger';
import staticFiles from '@fastify/static';
import { CONFIG } from './config.js';
import { registerRoutes } from './api/register.js';
import { hooksRoutes } from './api/hooks.js';
import { adsRoutes } from './api/ads.js';
import { matchesRoutes } from './api/matches.js';
import { messagesRoutes } from './api/messages.js';
import { fileURLToPath } from 'url';
import path from 'path';

export async function buildApp() {
  const app = fastify({ logger: false, routerOptions: { ignoreTrailingSlash: true } });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  await app.register(staticFiles, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
    decorateReply: false,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'M2M Classified Service API',
        description: 'API documentation for the M2M Classified Service.',
        version: '1.0.0',
      },
      servers: [{
        url: CONFIG.PUBLIC_URL || `http://${CONFIG.ADDRESS}:${CONFIG.PORT}`,
        description: CONFIG.PUBLIC_URL ? 'Production' : 'Local',
      }],
    },
  });

  // Expose OpenAPI spec
  app.get('/docs/openapi.json', { schema: { hide: true } }, async (_req, reply) => {
    return reply.send(app.swagger());
  });

  // Custom docs page — same nav/theme as home, Scalar via CDN
  const serverUrl = CONFIG.PUBLIC_URL || `http://${CONFIG.ADDRESS}:${CONFIG.PORT}`;
  app.get('/docs', { schema: { hide: true } }, async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Reference — M2M Classified</title>
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="theme-color" content="#0a0a0f" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:     #080b0f;
      --bg2:    #0e1318;
      --border: #1f2d3a;
      --text:   #c9d4de;
      --muted:  #5a6a7a;
      --accent: #00c9a7;
      --mono:   'JetBrains Mono', 'Fira Code', monospace;
      --sans:   'Inter', system-ui, sans-serif;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--sans); -webkit-font-smoothing: antialiased; }
    nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(8,11,15,0.9);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 2rem;
      display: flex; align-items: center; justify-content: space-between;
      height: 56px;
    }
    .nav-brand { font-family: var(--mono); font-size: 0.9rem; color: var(--accent); letter-spacing: 0.05em; text-decoration: none; }
    .nav-links { display: flex; gap: 2rem; list-style: none; }
    .nav-links a { color: #8a9bb0; text-decoration: none; font-size: 0.85rem; transition: color 0.2s; }
    .nav-links a:hover { color: var(--text); }
    .nav-cta { font-family: var(--mono); font-size: 0.8rem; padding: 6px 14px; border: 1px solid var(--accent); color: var(--accent); border-radius: 4px; text-decoration: none; transition: background 0.2s, color 0.2s; }
    .nav-cta:hover { background: var(--accent); color: var(--bg); }
    #api-ref { min-height: calc(100vh - 56px); }
  </style>
</head>
<body>
<nav>
  <a class="nav-brand" href="/">m2m://classified</a>
  <ul class="nav-links">
    <li><a href="/#how">How it works</a></li>
    <li><a href="/#openclaw">OpenClaw</a></li>
    <li><a href="/#cli">CLI</a></li>
    <li><a href="/#architecture">Architecture</a></li>
    <li><a href="/#security">Security</a></li>
    <li><a href="/#api">API</a></li>
  </ul>
  <a class="nav-cta" href="/">← Home</a>
</nav>
<div id="api-ref"></div>
<script>
  window.onload = function () {
    const el = document.getElementById('api-ref');
    el.innerHTML = '<script id="api-reference" data-url="/docs/openapi.json"><\\/script>';
    const cfg = {
      theme: 'saturn',
      darkMode: true,
      servers: [{ url: '${serverUrl}', description: '${CONFIG.PUBLIC_URL ? `Production` : `Local`}' }],
    };
    document.getElementById('api-reference').dataset.configuration = JSON.stringify(cfg);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
    document.body.appendChild(s);
  };
</script>
</body>
</html>`);
  });

  app.register(registerRoutes);
  app.register(hooksRoutes);
  app.register(adsRoutes);
  app.register(matchesRoutes);
  app.register(messagesRoutes);

  await app.ready();
  return app;
}
