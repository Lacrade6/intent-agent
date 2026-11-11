#!/usr/bin/env node
/** Render the real demo transcript (demo/demo-output.txt) as a terminal-style
 *  HTML page, for a faithful screenshot of actual CLI output. */
const fs = require('fs');
const path = require('path');

const txt = fs.readFileSync(path.join(__dirname, '..', 'demo', 'demo-output.txt'), 'utf8');
const esc = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin:0; background:#0d1117; color:#e6edf3; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; line-height:1.45; }
.bar { background:#161b22; padding:8px 14px; color:#8b949e; border-bottom:1px solid #30363d; font-size:12px; }
.bar b { color:#e6edf3; }
pre { margin:0; padding:14px 16px 20px; white-space:pre-wrap; word-break:break-word; }
</style></head><body><div class="bar"><b>● ● ●</b>&nbsp;&nbsp;intent-agent — <b>npm run demo</b> &nbsp;(NEAR testnet)</div><pre>${esc}</pre></body></html>`;
fs.writeFileSync('/tmp/cli-terminal.html', html);
console.log('wrote /tmp/cli-terminal.html');
