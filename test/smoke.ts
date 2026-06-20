import assert from "node:assert/strict";
import { computeScore, scoreToFrame, frameToBand, FLAME_MAX_FRAME } from "../worker/flame.ts";
import { fallbackGenerate, htmlToWorkerModule } from "../worker/fallback.ts";
import { isWorkerShaped, extractObject, toGeneration } from "../worker/generate.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

/** Recover the HTML embedded in a generated worker module string. */
function htmlFromModule(code: string): string {
  const match = code.match(/new Response\((".*?"),\s*\{/s);
  assert.ok(match, "module should contain a Response(<json string>, ...) call");
  return JSON.parse(match![1]) as string;
}

console.log("flame math:");
check("score is monotonic in each input", () => {
  assert.ok(computeScore(2, 1, 1) > computeScore(1, 1, 1));
  assert.ok(computeScore(1, 2, 1) > computeScore(1, 1, 1));
  assert.ok(computeScore(1, 1, 2) > computeScore(1, 1, 1));
});
check("streak contribution caps at 7", () => {
  assert.equal(computeScore(0, 0, 7), computeScore(0, 0, 20));
});
check("frame stays within sprite bounds", () => {
  assert.equal(scoreToFrame(-100), 0);
  assert.equal(scoreToFrame(100000), FLAME_MAX_FRAME);
  for (let s = 0; s < 200; s++) {
    const f = scoreToFrame(s);
    assert.ok(f >= 0 && f <= FLAME_MAX_FRAME);
  }
});
check("band maps frames to 0..3", () => {
  assert.equal(frameToBand(0), 0);
  assert.equal(frameToBand(4), 1);
  assert.equal(frameToBand(8), 2);
  assert.equal(frameToBand(15), 3);
});
check("flame visibly grows over a few demo turns", () => {
  // Day 1: turn1 -> turn2 -> turn3 with growing concept set.
  const f1 = scoreToFrame(computeScore(1, 2, 1));
  const f2 = scoreToFrame(computeScore(2, 4, 1));
  const f3 = scoreToFrame(computeScore(3, 6, 1));
  assert.ok(f3 > f1, `expected growth, got ${f1} -> ${f3}`);
  assert.ok(f2 >= f1 && f3 >= f2);
});

console.log("fallback generator:");
const wishes = [
  "サイコロを振るページを作って",
  "クリックで数えるカウンター",
  "やることリストが欲しい",
  "ストップウォッチ",
  "なにか面白いもの",
];
for (const wish of wishes) {
  check(`"${wish}" -> runnable worker + html`, () => {
    const gen = fallbackGenerate(wish);
    assert.ok(isWorkerShaped(gen.code), "code must be worker-shaped");
    assert.ok(gen.concepts.length >= 3, "should expose >=3 concepts");
    assert.ok(gen.explanation.length > 0 && gen.next_spark.length > 0);
    assert.equal(gen.source, "fallback");
    const html = htmlFromModule(gen.code);
    assert.ok(html.includes("<!doctype html>"), "html document");
    assert.ok(html.includes("<script>"), "has interactivity");
    assert.equal(html, gen.html, "module html matches stored html");
  });
}

console.log("worker module wrapping:");
check("htmlToWorkerModule round-trips arbitrary html", () => {
  const html = '<html>"quoted" `backtick` ${x} 日本語</html>';
  const mod = htmlToWorkerModule(html);
  assert.ok(isWorkerShaped(mod));
  assert.equal(htmlFromModule(mod), html);
});

console.log("AI output parsing:");
check("parses OpenAI-style choices[].message.content (JSON string)", () => {
  const aiResult = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            code: "export default { async fetch() { return new Response('<html></html>'); } }",
            explanation: "せつめい",
            next_spark: "つぎ",
            concepts: ["HTML", "JS"],
          }),
        },
      },
    ],
  };
  const gen = toGeneration(extractObject(aiResult));
  assert.ok(gen, "should parse");
  assert.equal(gen!.source, "ai");
  assert.ok(isWorkerShaped(gen!.code));
});
check("parses legacy { response: {...} } shape", () => {
  const aiResult = {
    response: {
      code: "export default { fetch() { return new Response('x'.repeat(50)); } }",
      explanation: "x",
      next_spark: "y",
      concepts: ["a", "b", "c"],
    },
  };
  const gen = toGeneration(extractObject(aiResult));
  assert.ok(gen);
});
check("strips ```json fences", () => {
  const raw = "```json\n" + JSON.stringify({
    code: "export default { async fetch(){ return new Response('<html>ok</html>'); } }",
    explanation: "a",
    next_spark: "b",
    concepts: ["x"],
  }) + "\n```";
  const gen = toGeneration(extractObject(raw));
  assert.ok(gen);
});
check("rejects non-worker-shaped code", () => {
  assert.equal(toGeneration({ code: "console.log('hi')", explanation: "a", next_spark: "b", concepts: [] }), null);
  assert.equal(toGeneration(extractObject("not json at all")), null);
});

console.log(`\n${passed} checks passed.`);
