import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const pathOf = (url) => fileURLToPath(url);

const root = new URL("../public/", import.meta.url);
const icons = new URL("icons/", root);
await mkdir(icons, { recursive: true });

const background = "linear-gradient(145deg, #0f1420 0%, #172238 58%, #1b2b48 100%)";

const glyph = (size, radius, label = true) => `
  <div style="
    width:${size}px;height:${size}px;border-radius:${radius}px;
    background:${background};position:relative;overflow:hidden;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'Segoe UI',system-ui,sans-serif;
  ">
    <div style="position:absolute;inset:-20% -30% auto auto;width:70%;height:70%;
      background:radial-gradient(circle,rgba(79,140,255,.34),transparent 68%);"></div>
    <svg viewBox="0 0 100 100" width="${size * 0.92}" height="${size * 0.92}"
      style="position:absolute;inset:0;margin:auto;opacity:.5">
      <g fill="none" stroke="#4f8cff" stroke-width="2.2">
        <path d="M50 26 C42 21 30 20 20 23 L20 74 C30 71 42 72 50 77 C58 72 70 71 80 74 L80 23 C70 20 58 21 50 26 Z" />
        <path d="M50 26 L50 77" />
        <path d="M28 36 C34 34 40 34 44 36 M28 46 C34 44 40 44 44 46 M28 56 C34 54 40 54 44 56" />
      </g>
    </svg>
    <div style="
      position:relative;font-size:${size * 0.42}px;font-weight:800;letter-spacing:-.055em;
      color:#eef4ff;line-height:1;text-shadow:0 6px 24px rgba(0,0,0,.45);
    ">L<span style="color:#4f8cff">.</span></div>
    ${label ? `<div style="position:relative;margin-top:${size * 0.035}px;
      font-size:${size * 0.062}px;font-weight:600;letter-spacing:.22em;color:#93a1b8;
    ">LEARN</div>` : ""}
  </div>`;

const browser = await chromium.launch(process.env.CI ? {} : { channel: "chrome" });

async function shoot(size, file, { maskable = false, label = size >= 96 } = {}) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const inner = maskable
    ? glyph(Math.round(size * 0.78), Math.round(size * 0.18), label)
    : glyph(size, radius, label);
  await page.setContent(
    `<style>*{box-sizing:border-box}html,body{margin:0;width:${size}px;height:${size}px;background:transparent}
     body{display:flex;align-items:center;justify-content:center}</style>${inner}`
  );
  await page.screenshot({ path: pathOf(new URL(file, root)), omitBackground: true });
  await page.close();
}

await shoot(512, "icons/icon-512.png");
await shoot(192, "icons/icon-192.png");
await shoot(180, "icons/apple-touch-icon.png");
await shoot(32, "icons/favicon-32.png");
await shoot(512, "icons/maskable-512.png", { maskable: true });

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f1420"/>
      <stop offset="1" stop-color="#1b2b48"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <g fill="none" stroke="#4f8cff" stroke-width="1.4" opacity=".55">
    <path d="M32 17 C27 14 20 13 14 15 L14 47 C20 45 27 46 32 49 C37 46 44 45 50 47 L50 15 C44 13 37 14 32 17 Z"/>
    <path d="M32 17 L32 49"/>
  </g>
  <text x="32" y="42" font-family="Segoe UI, Arial, sans-serif" font-size="31"
    font-weight="800" text-anchor="middle" fill="#eef4ff">L<tspan fill="#4f8cff">.</tspan></text>
</svg>
`;
await writeFile(pathOf(new URL("favicon.svg", root)), favicon);

const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await og.setContent(`<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif; color: #e8edf6;
    background:
      radial-gradient(900px 500px at 86% -10%, rgba(79,140,255,.28), transparent 62%),
      radial-gradient(700px 420px at 8% 110%, rgba(62,207,142,.10), transparent 60%),
      #0f1420;
    position: relative; overflow: hidden;
  }
  .grid { position: absolute; inset: 0; opacity: .5;
    background-image: linear-gradient(rgba(79,140,255,.09) 1px, transparent 1px),
      linear-gradient(90deg, rgba(79,140,255,.09) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(circle at 76% 40%, #000 0%, transparent 72%);
  }
  .frame { position: relative; height: 100%; padding: 58px 64px; display: flex; gap: 48px; align-items: center; }
  .left { flex: 1; }
  .eyebrow { display: flex; align-items: center; gap: 12px; font-size: 19px; color: #8ab4ff;
    font-weight: 600; letter-spacing: .04em; margin-bottom: 22px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #3ecf8e; box-shadow: 0 0 14px #3ecf8e; }
  h1 { margin: 0; font-size: 82px; line-height: .98; letter-spacing: -.045em; font-weight: 800; }
  h1 span { color: #4f8cff; }
  .sub { margin: 22px 0 0; font-size: 27px; line-height: 1.35; color: #b7c3d8; max-width: 560px; }
  .stats { display: flex; gap: 14px; margin-top: 34px; flex-wrap: wrap; }
  .stat { border: 1px solid #2c3850; background: rgba(26,34,51,.86); border-radius: 12px;
    padding: 12px 16px; font-size: 18px; color: #c8d3e6; }
  .stat b { color: #fff; font-size: 22px; margin-right: 5px; }
  .foot { position: absolute; left: 64px; bottom: 34px; font-size: 17px; color: #6f7f99; }
  .card { width: 380px; flex-shrink: 0; background: #1a2233; border: 1px solid #2c3850;
    border-radius: 20px; padding: 22px; box-shadow: 0 30px 90px rgba(0,0,0,.5); transform: rotate(1.2deg); }
  .card-top { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .pill { font-size: 12px; color: #93a1b8; border: 1px solid #2c3850; border-radius: 999px;
    padding: 5px 10px; background: #212c42; }
  .pill.good { color: #3ecf8e; }
  .q { font-size: 17px; line-height: 1.42; margin: 0 0 16px; }
  .opt { display: flex; gap: 10px; align-items: center; border: 1px solid #2c3850;
    background: #212c42; border-radius: 10px; padding: 10px 12px; font-size: 14px; color: #dbe4f3; margin-bottom: 8px; }
  .opt.good { border-color: #3ecf8e; background: rgba(62,207,142,.12); }
  .letter { width: 24px; height: 24px; border-radius: 50%; background: #0f1420; color: #93a1b8;
    display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .opt.good .letter { color: #3ecf8e; }
  .bar { height: 6px; border-radius: 4px; background: #212c42; overflow: hidden; margin-top: 16px; }
  .bar i { display: block; width: 68%; height: 100%; background: #4f8cff; }
  .card-foot { margin-top: 9px; font-size: 12px; color: #93a1b8; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="grid"></div>
  <div class="frame">
    <div class="left">
      <div class="eyebrow"><span class="dot"></span> University course hub</div>
      <h1>Learn<span>.</span><br/>Course Hub</h1>
      <p class="sub">Practice with instant feedback, master your mistakes, and sit timed mock exams.</p>
      <div class="stats">
        <div class="stat"><b>12</b> sample questions</div>
        <div class="stat">Timed mock exams</div>
        <div class="stat">Progress saved on your device</div>
      </div>
    </div>
    <div class="card">
      <div class="card-top"><span class="pill">Quick quiz</span><span class="pill">Question 4 / 12</span><span class="pill good">Score: 3/3</span></div>
      <p class="q">Which study method best strengthens long-term recall?</p>
      <div class="opt good"><span class="letter">A</span> Spacing practice across days</div>
      <div class="opt"><span class="letter">B</span> Rereading the chapter once</div>
      <div class="opt"><span class="letter">C</span> Highlighting every sentence</div>
      <div class="opt"><span class="letter">D</span> Listening to the lecture again</div>
      <div class="bar"><i></i></div>
      <div class="card-foot"><span>Progress saved locally</span><span>4/12</span></div>
    </div>
  </div>
  <div class="foot">learn.aizat.my · practice, review, and mock exams</div>
</body></html>`);
await og.screenshot({ path: pathOf(new URL("og-image.png", root)) });
await og.close();

await browser.close();
console.log("Wrote favicon.svg, favicon-32.png, apple-touch-icon.png, icon-192/512, maskable-512, og-image.png");
