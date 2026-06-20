import type { Generation } from "./types.ts";

/**
 * Wrap a complete HTML document into a self-contained Worker module string,
 * matching the contract the AI is asked to follow. Using JSON.stringify keeps
 * the embedded HTML safe regardless of quotes, backticks, or unicode.
 */
export function htmlToWorkerModule(html: string): string {
  return `export default {
  async fetch() {
    return new Response(${JSON.stringify(html)}, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
`;
}

interface Template {
  title: string;
  body: string;
  concepts: string[];
  explanation: string;
  next_spark: string;
}

function page(title: string, inner: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: radial-gradient(circle at 50% 0%, #2a1206, #140a04 60%, #0a0502);
    color: #ffe9c7;
  }
  .card {
    text-align: center; padding: 32px 28px; border-radius: 20px;
    background: rgba(255, 150, 60, 0.08);
    border: 1px solid rgba(255, 160, 70, 0.25);
    box-shadow: 0 20px 60px rgba(0,0,0,0.45);
    max-width: 420px; width: calc(100vw - 32px);
  }
  h1 { font-size: 1.4rem; margin: 0 0 16px; color: #ffb347; }
  button {
    cursor: pointer; border: none; border-radius: 999px;
    padding: 12px 22px; font-size: 1rem; font-weight: 700;
    color: #2a1206; background: linear-gradient(135deg, #ffd86b, #ff8a3c);
    transition: transform .12s ease, filter .12s ease;
  }
  button:hover { transform: translateY(-2px); filter: brightness(1.05); }
  button:active { transform: translateY(0); }
  input {
    border-radius: 10px; border: 1px solid rgba(255,160,70,.4);
    background: rgba(0,0,0,.25); color: #ffe9c7; padding: 10px 12px; font-size: 1rem;
  }
  .out { font-size: 3rem; font-weight: 800; margin: 16px 0; color: #fff; }
  ul { list-style: none; padding: 0; text-align: left; }
  li { padding: 8px 12px; border-radius: 8px; background: rgba(0,0,0,.2); margin: 6px 0; }
</style>
</head>
<body>
  <div class="card">${inner}</div>
</body>
</html>`;
}

function pickTemplate(wish: string): Template {
  const w = wish.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => wish.includes(k) || w.includes(k));

  if (has("サイコロ", "ダイス", "dice", "ランダム", "乱数", "おみくじ")) {
    return {
      title: "サイコロアプリ",
      concepts: ["HTML", "ボタンイベント", "乱数(Math.random)", "DOM操作"],
      explanation:
        "ボタンを押すと1〜6のランダムな数字が出るサイコロです。`Math.random()`で乱数を作り、押されたとき(イベント)に画面の文字を書き換えています。",
      next_spark: "出た目の履歴を画面に残せるようにしてみよう",
      body: `
  <h1>🎲 サイコロ</h1>
  <div class="out" id="o">-</div>
  <button id="b">振る</button>
  <script>
    const o = document.getElementById('o');
    document.getElementById('b').onclick = () => {
      o.textContent = 1 + Math.floor(Math.random() * 6);
    };
  </script>`,
    };
  }

  if (has("カウンター", "カウント", "数える", "counter", "クリック")) {
    return {
      title: "カウンター",
      concepts: ["HTML", "状態管理(変数)", "ボタンイベント", "DOM操作"],
      explanation:
        "ボタンを押した回数を覚えておく『カウンター』です。`count`という変数に数を保存し(状態管理)、押すたびに+1して表示を更新します。",
      next_spark: "マイナスボタンやリセットボタンを足してみよう",
      body: `
  <h1>➕ カウンター</h1>
  <div class="out" id="o">0</div>
  <button id="b">+1</button>
  <script>
    let count = 0;
    const o = document.getElementById('o');
    document.getElementById('b').onclick = () => { count++; o.textContent = count; };
  </script>`,
    };
  }

  if (has("todo", "やること", "リスト", "メモ", "タスク", "買い物")) {
    return {
      title: "やることリスト",
      concepts: ["HTML", "配列", "ループ(map)", "フォーム入力", "DOM操作"],
      explanation:
        "入力したことを一覧に追加できる『やることリスト』です。入力値を配列にためて、ループで画面に並べています。",
      next_spark: "完了したタスクに取り消し線を付けられるようにしてみよう",
      body: `
  <h1>📝 やることリスト</h1>
  <div style="display:flex;gap:8px;justify-content:center;">
    <input id="t" placeholder="やることを入力" />
    <button id="b">追加</button>
  </div>
  <ul id="list"></ul>
  <script>
    const items = [];
    const list = document.getElementById('list');
    const input = document.getElementById('t');
    function render() {
      list.innerHTML = items.map(x => '<li>・' + x + '</li>').join('');
    }
    document.getElementById('b').onclick = () => {
      if (input.value.trim()) { items.push(input.value.trim()); input.value=''; render(); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('b').click(); });
  </script>`,
    };
  }

  if (has("タイマー", "ストップウォッチ", "timer", "時間", "秒")) {
    return {
      title: "ストップウォッチ",
      concepts: ["HTML", "setInterval(時間処理)", "状態管理", "DOM操作"],
      explanation:
        "スタートで時間が進み、ストップで止まるストップウォッチです。`setInterval`で一定間隔ごとに表示を更新しています。",
      next_spark: "リセットボタンと、ラップ(途中記録)を足してみよう",
      body: `
  <h1>⏱ ストップウォッチ</h1>
  <div class="out" id="o">0.0</div>
  <button id="s">スタート</button>
  <button id="p">ストップ</button>
  <script>
    let t = 0, timer = null;
    const o = document.getElementById('o');
    document.getElementById('s').onclick = () => {
      if (timer) return;
      timer = setInterval(() => { t += 0.1; o.textContent = t.toFixed(1); }, 100);
    };
    document.getElementById('p').onclick = () => { clearInterval(timer); timer = null; };
  </script>`,
    };
  }

  return {
    title: "あいさつアプリ",
    concepts: ["HTML", "フォーム入力", "ボタンイベント", "DOM操作"],
    explanation:
      "名前を入れてボタンを押すと、あいさつを返してくれるアプリです。入力(input)を読み取り、画面の文字を書き換える基本の形です。",
    next_spark: "時間帯によって『おはよう/こんばんは』を出し分けてみよう",
    body: `
  <h1>🔥 はじめての一歩</h1>
  <p style="opacity:.8;font-size:.9rem;">お題: ${escapeHtml(wish).slice(0, 80)}</p>
  <div style="display:flex;gap:8px;justify-content:center;">
    <input id="n" placeholder="なまえ" />
    <button id="b">あいさつ</button>
  </div>
  <div class="out" id="o" style="font-size:1.4rem;">こんにちは！</div>
  <script>
    document.getElementById('b').onclick = () => {
      const n = document.getElementById('n').value.trim() || 'あなた';
      document.getElementById('o').textContent = 'こんにちは、' + n + 'さん！🔥';
    };
  </script>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Deterministic, offline app generator. Used when Workers AI is unavailable
 * (e.g. local dev without credentials) or when AI generation fails validation.
 */
export function fallbackGenerate(wish: string): Generation & { html: string } {
  const tpl = pickTemplate(wish);
  const html = page(tpl.title, tpl.body);
  return {
    code: htmlToWorkerModule(html),
    html,
    explanation: tpl.explanation,
    next_spark: tpl.next_spark,
    concepts: tpl.concepts,
    source: "fallback",
  };
}
