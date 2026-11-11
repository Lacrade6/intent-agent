#!/usr/bin/env python3
"""Render faithful screenshots with PIL (headless Chrome is unavailable in
this sandbox — the Hatch Chromium build refuses to start outside the
browser service). Both images are rendered from REAL data:
- cli-demo.png: the exact bytes of demo/demo-output.txt (real CLI run).
- dashboard.png: live values fetched from the running dashboard API
  (/api/status + /api/history) at render time.
"""
import json
import urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = "/home/hatch/workspace/near-hackathon/intent-agent"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
BG = (13, 17, 23)
CARD = (22, 27, 34)
LINE = (48, 54, 61)
TEXT = (230, 237, 243)
DIM = (139, 148, 158)
GREEN = (63, 185, 80)
AMBER = (210, 153, 34)
RED = (248, 81, 73)
BLUE = (88, 166, 255)


def font(size, bold=False):
    return ImageFont.truetype(MONO_B if bold else MONO, size)


def render_terminal():
    import textwrap
    with open(f"{ROOT}/demo/demo-output.txt") as f:
        raw = f.read().rstrip("\n").split("\n")
    # DejaVu Sans Mono has no emoji/box glyphs: substitute + wrap long lines.
    subs = {"⛔": "[X]", "🔶": "[~]", "✅": "[OK]", "❓": "[?]", "❌": "[X]", "═": "=", "─": "-"}
    lines = []
    for line in raw:
        for k, v in subs.items():
            line = line.replace(k, v)
        lines.extend(textwrap.wrap(line, width=104, replace_whitespace=False, drop_whitespace=False) or [""])
    fs, lh = 14, 20
    W = 1020
    title_h = 34
    H = title_h + len(lines) * lh + 24
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, title_h], fill=CARD)
    d.text((14, 9), "● ● ●   intent-agent — npm run demo  (NEAR testnet)", font=font(13), fill=DIM)
    y = title_h + 10
    f = font(fs)
    for line in lines:
        color = TEXT
        if line.startswith("[OK]") or "EXECUTED" in line:
            color = GREEN
        elif line.startswith("[X]") or "REFUSED" in line:
            color = RED
        elif "[~]" in line or "SIMULATED" in line:
            color = AMBER
        elif line.startswith("[Act") or line.startswith("==") or line.startswith("--"):
            color = BLUE
        d.text((14, y), line, font=f, fill=color)
        y += lh
    img.save(f"{ROOT}/docs/screenshots/cli-demo.png")
    print("saved cli-demo.png", img.size)


def render_dashboard():
    def get(path):
        with urllib.request.urlopen(f"http://localhost:3000{path}", timeout=10) as r:
            return json.loads(r.read())

    s = get("/api/status")
    hist = get("/api/history")
    W = 1180
    y = 0
    img = Image.new("RGB", (W, 1400), BG)
    d = ImageDraw.Draw(img)
    # header
    d.text((24, 18), "IntentAgent", font=font(22, True), fill=TEXT)
    d.text((200, 24), "NEAR TESTNET ONLY", font=font(13, True), fill=(255, 255, 255))
    d.rectangle([192, 20, 372, 44], outline=BLUE)
    d.text((392, 26), "Tell it what to pay. It handles the chains.", font=font(13), fill=DIM)
    y = 64
    # treasury card
    def card(y0, h, title):
        d.rectangle([24, y0, W - 24, y0 + h], outline=LINE, fill=CARD)
        d.text((40, y0 + 12), title, font=font(15, True), fill=TEXT)
        return y0 + 40
    y1 = card(y, 190, "Treasury")
    d.text((40, y1), f"{s['balance']} NEAR", font=font(26, True), fill=TEXT)
    d.text((40, y1 + 44), f"Agent: {s['agent']}", font=font(13), fill=DIM)
    d.text((40, y1 + 66), f"Recipient: {s['recipient']} ({s['recipientBalance']} NEAR)", font=font(13), fill=DIM)
    d.text((40, y1 + 88), f"Fees earned: {s['feesEarned']['near']:.5f} NEAR (${s['feesEarned']['usd']:.4f})  ·  {s['feesEarned']['count']} payments recorded", font=font(13), fill=TEXT)
    y = y + 190 + 16
    # policy card
    p = s["policy"]
    y1 = card(y, 170, "Policy (human rules — the agent cannot override)")
    d.text((40, y1), f"Max per transaction: ${p['maxPerTxUsd']}   ·   Daily cap: ${p['dailyCapUsd']}   ·   Service fee: {p['serviceFeeBps']/100}%", font=font(13), fill=TEXT)
    d.text((40, y1 + 26), f"Allowed chains: {', '.join(p['allowedChains'])}", font=font(13), fill=TEXT)
    d.text((40, y1 + 52), "Allowed recipients:", font=font(13), fill=TEXT)
    d.text((40, y1 + 76), "  " + ", ".join(p["allowedRecipients"])[:150], font=font(12), fill=DIM)
    y = y + 170 + 16
    # history card
    rows = hist
    y1 = card(y, 60 + len(rows) * 44, "Payment history")
    yy = y1
    d.text((40, yy), "When", font=font(12, True), fill=DIM)
    d.text((220, yy), "Instruction", font=font(12, True), fill=DIM)
    d.text((700, yy), "Status", font=font(12, True), fill=DIM)
    d.text((830, yy), "Recipient gets", font=font(12, True), fill=DIM)
    d.text((990, yy), "Tx / sim", font=font(12, True), fill=DIM)
    yy += 26
    for e in rows:
        st = e["status"].upper()
        col = GREEN if e["status"] == "executed" else AMBER if e["status"] == "simulated" else RED
        d.text((40, yy), e["recordedAt"][:19].replace("T", " "), font=font(12), fill=TEXT)
        d.text((220, yy), e["instruction"][:52], font=font(12), fill=TEXT)
        d.text((700, yy), st, font=font(12, True), fill=col)
        rg = e.get("recipientGets") or "—"
        d.text((830, yy), str(rg)[:18], font=font(12), fill=TEXT)
        ref = (e.get("txHash") or e.get("simulationId") or "—")[:16]
        d.text((990, yy), ref, font=font(12), fill=BLUE)
        yy += 44
    img = img.crop((0, 0, W, yy + 24))
    img.save(f"{ROOT}/docs/screenshots/dashboard.png")
    print("saved dashboard.png", img.size)


if __name__ == "__main__":
    render_terminal()
    render_dashboard()
