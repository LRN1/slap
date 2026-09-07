/* SLAP smoke-test v2 — W1 rewrite (2026-08-12)
   Replaces the stale 39-test pre-merge suite.
   HONESTY NOTE (unchanged law): jsdom has NO layout engine. All rects are 0.
   Geometry-dependent behavior (pile counts, flick targeting, centerline slots,
   tape placement) is verified STRUCTURALLY ONLY. Real verdicts live on-device.
*/
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

const html = readFileSync("/home/claude/kanban.html", "utf8");
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, note = "") {
  if (cond) { pass++; console.log("  ✓ " + name + (note ? "  [" + note + "]" : "")); }
  else { fail++; failures.push(name); console.log("  ✗ " + name + (note ? "  [" + note + "]" : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://x.test/",
  });
  const w = dom.window;
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  await sleep(350); // boot + first render
  const g = (expr) => w.eval(expr); // reach let-bound globals (db, state)
  return { dom, w, g, d: w.document };
}

function pdown(w, el, x = 10, y = 10) {
  el.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
}
function pup(w, el, x = 10, y = 10) {
  el.dispatchEvent(new w.PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
}

/* ================================================================= */
console.log("\n— BOOT & DATA MODEL —");
{
  const { w, g, d } = await boot();
  ok("board renders with column headers", d.querySelectorAll(".cname").length >= 3);
  ok("lane labels render (Work/Home)", d.querySelectorAll(".lane-label").length >= 2);
  ok("seed cards render", d.querySelectorAll(".card-el").length > 0);
  ok("ghost-note add affordance in cells", d.querySelectorAll(".ghost-note").length > 0);
  ok("db is v3", g("db") && g("db").v === 3);
  ok("db has appearance/archOn/randColor keys",
    "appearance" in g("db") && "archOn" in g("db") && "randColor" in g("db"));
  ok("db has archive block with cur week",
    g("db").archive && g("db").archive.cur && Array.isArray(g("db").archive.cur.items));
  ok("validateState passes on boot", w.validateState() !== false, "returns non-false / logs no invariant fail");
  ok("quick-actions removed (no function survives)",
    typeof w.openQuickActions === "undefined" && !d.querySelector(".qa,.quick-actions"));
}

/* ================================================================= */
console.log("\n— MIGRATE / BACKUP-RESTORE SHAPE —");
{
  const { w, g } = await boot();
  const legacy = { v: 2, boards: [w.defaultBoard()], current: null };
  legacy.current = legacy.boards[0].id;
  const up = w.migrate(JSON.parse(JSON.stringify(legacy)));
  ok("migrate injects archOn default", up.archOn === true);
  ok("migrate injects randColor default", up.randColor === false);
  ok("migrate injects appearance", typeof up.appearance === "string");
  ok("migrate injects archive block", !!(up.archive && up.archive.cur));
  const backup = JSON.stringify(g("db"));
  const restored = w.migrate(JSON.parse(backup));
  ok("backup JSON round-trips through migrate", restored.v === 3 && restored.boards.length === g("db").boards.length);
}

/* ================================================================= */
console.log("\n— ADD FLOW (ghost → editor → commit → microslap) —");
{
  const { w, g, d } = await boot();
  const before = g("state").cards.length;
  const ghost = d.querySelector(".ghost-note");
  ghost.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
  ghost.dispatchEvent(new w.PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  ghost.click();
  await sleep(60);
  const ta = d.querySelector(".card-el.editing textarea");
  ok("tap ghost opens focus editor", !!ta);
  if (ta) {
    ta.value = "test card";
    const done = d.querySelector(".edit-actions .done")||d.querySelector(".edit-tools .done");
    done.click();
    await sleep(90); /* microslap window is 220ms */
    ok("commit creates card", g("state").cards.length === before + 1);
    const nc = g("state").cards.find((c) => c.text === "test card");
    ok("new card defaults yellow (randColor off)", nc && nc.color === "yellow");
    const el2 = d.querySelector('.card-el[data-id="' + (nc && nc.id) + '"]');
    ok("creation micro-slap class applied", !!(el2 && el2.classList.contains("microslap")));
    await sleep(200);
    ok("ords contiguous after add", w.validateState() !== false);
  }
}

/* ================================================================= */
console.log("\n— EDIT / DELETE / UNDO —");
{
  const { w, g, d } = await boot();
  const card = g("state").cards[0];
  const el = d.querySelector('.card-el[data-id="' + card.id + '"]');
  pdown(w, el); pup(w, el); // release <220ms, no move = tap
  await sleep(60);
  const ta = d.querySelector(".card-el.editing textarea");
  ok("tap card opens editor with its text", !!ta && ta.value === card.text);
  d.querySelector(".edit-tools .danger")?.click();
  await sleep(100);
  ok("delete removes card", !g("state").cards.find((c) => c.id === card.id));
  const toastEl = d.getElementById("toast");
  ok("delete raises Undo toast", toastEl.classList.contains("on") && /undo/i.test(toastEl.textContent));
  toastEl.click();
  await sleep(100);
  ok("undo restores card", !!g("state").cards.find((c) => c.id === card.id));
}

/* ================================================================= */
console.log("\n— HOLD-STILL = BLOCK TOGGLE —");
{
  const { w, g, d } = await boot();
  const card = g("state").cards[0];
  const was = !!card.blocked;
  const el = d.querySelector('.card-el[data-id="' + card.id + '"]');
  pdown(w, el, 50, 50);
  await sleep(300); // hold fires at 220 → drag mode, no movement
  pup(w, el, 50, 50);
  await sleep(100);
  ok("hold-still toggles blocked ON", g("state").cards.find((c) => c.id === card.id).blocked === !was);
  const el2 = d.querySelector('.card-el[data-id="' + card.id + '"]');
  ok("blocked class renders", !was ? el2.classList.contains("blocked") : !el2.classList.contains("blocked"));
  pdown(w, el2, 50, 50); await sleep(300); pup(w, el2, 50, 50); await sleep(100);
  ok("hold-still toggles blocked back OFF", g("state").cards.find((c) => c.id === card.id).blocked === was);
}

/* ================================================================= */
console.log("\n— SLAP PHYSICS (amp curve, MAX, dust) —");
{
  const { w, g, d } = await boot();
  const card = g("state").cards[0];
  const ampOf = () => {
    const el = d.querySelector('.card-el[data-id="' + card.id + '"]');
    return parseFloat(el.style.getPropertyValue("--amp"));
  };
  w.slapLand(card, false, 3);
  ok("non-Done landing = mini amp .18 regardless of speed", ampOf() === 0.18);
  w.slapLand(card, true, 0);
  ok("Done landing floor amp .30", Math.abs(ampOf() - 0.3) < 0.01);
  w.slapLand(card, true, 0.8);
  const exp = 0.3 + Math.pow(0.8, 1.35) * 1.05;
  ok("Done amp follows superlinear curve", Math.abs(ampOf() - exp) < 0.011, "speed .8 → " + exp.toFixed(2));
  delete card.skew;
  w.slapLand(card, true, 3);
  ok("Done amp ceiling 1.6", ampOf() === 1.6);
  ok("MAX slap persists crooked skew ±6–9°", typeof card.skew === "number" && Math.abs(card.skew) >= 6 && Math.abs(card.skew) <= 9, "skew=" + JSON.stringify(card.skew) + " id=" + card.id + " amp=" + ampOf());
  const el = d.querySelector('.card-el[data-id="' + card.id + '"]');
  ok("MAX triggers board shake class", d.getElementById("viewport").classList.contains("vshake"));
  ok("dust spawned at amp ≥ .3", !!el.querySelector(".sdust"));
  await sleep(500);
}

/* ================================================================= */
console.log("\n— FLICK GATING (geometry blind in jsdom — gate logic only) —");
{
  const { w, g } = await boot();
  ok("slow release never flick-targets (speed gate .5)", w.bestFlickCell(0, 0, 0.3, 0, "x", "y") === null);
  ok("zero-rect world yields no target (cone gate holds)", w.bestFlickCell(0, 0, 3, 0, "x", "y") === null,
    "aim-cone dot>.45 NOT verifiable in jsdom — device-only");
}

/* ================================================================= */
console.log("\n— PLACECARD (centerline slot bookkeeping) —");
{
  const { w, g } = await boot();
  const lane = g("state").lanes[0].id, col = g("state").columns[0].id;
  const other = g("state").lanes[1].id;
  const c = g("state").cards.find((k) => k.lane !== lane || k.col !== col) || g("state").cards[0];
  w.placeCard(c, lane, col, 0);
  ok("placeCard inserts at index 0", c.lane === lane && c.col === col && c.ord === 0);
  ok("ords contiguous after insert", w.validateState() !== false);
  const prev = w.placeCard(c, other, col, null);
  ok("placeCard(null) appends bottom", c.ord === g("state").cards.filter((k) => k.lane === other && k.col === col).length - 1);
  ok("placeCard returns prev position for undo", prev.lane === lane && prev.col === col);
  ok("source cell ords renormalized", w.validateState() !== false);
}

/* ================================================================= */
console.log("\n— PILES + FAN (structural only; counts are layout-dependent) —");
{
  const { w, g, d } = await boot();
  const lane = g("state").lanes[0].id, col = g("state").columns[0].id;
  for (let i = 0; i < 8; i++)
    g("state").cards.push({ id: "pt" + i, text: "p" + i, color: "yellow", blocked: false, lane, col, ord: 0 });
  g("state").cards.filter((c) => c.lane === lane && c.col === col).sort((a,b)=>a.ord-b.ord).forEach((c, i) => (c.ord = i));
  w.normalizeOrds(lane, col);
  w.render(); await sleep(80);
  const cell = d.querySelector('.cell[data-lane="' + lane + '"][data-col="' + col + '"]');
  ok(">5 cards → scroll window renders", !!cell.querySelector(".swin"));
  const pile = cell.querySelector(".pile");
  ok(">5 cards → pile renders beneath", !!pile);
  if (pile) {
    pile.click(); await sleep(80);
    const fanCards = d.querySelectorAll("#pileFan .fgrid .card-el");
    ok("tap pile opens fan overlay", fanCards.length > 0 && d.getElementById("pileFan").classList.contains("on"), "jsdom: rects 0 → 'below' = all cards; count untestable");
  } else ok("tap pile opens fan overlay", false, "no pile to tap");
}

/* ================================================================= */
console.log("\n— LEDGER: archive one / per-lane sweep / undo —");
{
  const { w, g, d } = await boot();
  const doneCol = g("state").columns.find((c) => c.name.trim().toLowerCase() === "done").id;
  const lane0 = g("state").lanes[0].id, lane1 = g("state").lanes[1].id;
  const nextOrd = (l, c) => g("state").cards.filter((k) => k.lane === l && k.col === c).length;
  g("state").cards.push(
    { id: "d1", text: "done-l0", color: "teal", blocked: false, lane: lane0, col: doneCol, ord: nextOrd(lane0, doneCol) },
  );
  g("state").cards.push(
    { id: "d2", text: "done-l0b", color: "blue", blocked: false, lane: lane0, col: doneCol, ord: nextOrd(lane0, doneCol) },
  );
  g("state").cards.push(
    { id: "d3", text: "done-l1", color: "green", blocked: false, lane: lane1, col: doneCol, ord: nextOrd(lane1, doneCol) },
  );
  w.render(); await sleep(60);
  const n0 = g("state").cards.length, a0 = g("db").archive.cur.items.length;
  w.archiveItems([g("state").cards.find((c) => c.id === "d1")]);
  await sleep(60);
  ok("archive one: card leaves board", !g("state").cards.find((c) => c.id === "d1"));
  ok("archive one: ledger week +1", g("db").archive.cur.items.length === a0 + 1);
  d.getElementById("toast").click(); await sleep(60);
  ok("archive undo restores card AND count", g("state").cards.length === n0 && g("db").archive.cur.items.length === a0);
  w.sweepLaneDone(lane0); await sleep(60);
  ok("per-lane sweep archives ONLY that lane's Done",
    !g("state").cards.find((c) => c.id === "d1") && !g("state").cards.find((c) => c.id === "d2") &&
    !!g("state").cards.find((c) => c.id === "d3"));
  d.getElementById("toast").click(); await sleep(60);
  ok("sweep undo restores lane", !!g("state").cards.find((c) => c.id === "d1") && !!g("state").cards.find((c) => c.id === "d2"));
  ok("isoWeek returns sane week number", w.isoWeek(new Date()) >= 1 && w.isoWeek(new Date()) <= 53);
  /* REGRESSION (found by this suite 2026-08-12): archiving a mid-cell card
     must renormalize vacated cell ords — no gaps, no silent invariant alarms */
  const mids = ["ra","rb","rc"].map((id) => {
    const c = { id, text: id, color: "yellow", blocked: false, lane: lane0, col: doneCol,
      ord: g("state").cards.filter((k) => k.lane === lane0 && k.col === doneCol).length };
    g("state").cards.push(c); return c;
  });
  w.render(); await sleep(40);
  w.archiveItems([mids[1]]); await sleep(40);
  ok("REGRESSION: mid-cell archive leaves NO ord gap", w.validateState() === true);
  d.getElementById("toast").click(); await sleep(40);
  ok("REGRESSION: archive-undo restore renormalizes too", w.validateState() === true);
}

/* ================================================================= */
console.log("\n— TRAY RENDER + ARM→SURE? + ARCHIVE TOGGLE —");
{
  const { w, g, d } = await boot();
  ok("trays render when archOn", d.querySelectorAll(".tray").length >= 2, "one per lane after Done");
  ok("tray = dashed dz + quiet ALL chip", !!d.querySelector(".tray .dz") && !!d.querySelector(".tray .allbar"));
  const ab = d.querySelector(".tray .allbar");
  ab.click(); await sleep(30);
  ok("first tap arms to SURE?", ab.classList.contains("arm") && /sure/i.test(ab.textContent));
  const doneCol = g("state").columns.find((c) => c.name.trim().toLowerCase() === "done").id;
  const laneOfTray = ab.closest(".tray") ? null : null; // sweep verified in ledger block; here: arm state only
  ok("ledger pill present", !!d.getElementById("ledgerPill"));
  g("db").archOn = false; w.render(); await sleep(60);
  ok("archive OFF removes trays", d.querySelectorAll(".tray").length === 0);
  g("db").archOn = true; w.render(); await sleep(60);
  ok("archive ON restores trays", d.querySelectorAll(".tray").length >= 2);
}

/* ================================================================= */
console.log("\n— MENU / SETTINGS —");
{
  const { w, g, d } = await boot();
  for (const id of ["mEditB", "mBoards", "mBackup", "mRestore", "mAppr", "mRand", "mArch"])
    ok("menu row #" + id + " exists", !!d.getElementById(id));
  ok("appearance segment has light/dark/system", d.querySelectorAll("#apprSeg button").length === 3);
  g("db").appearance = "dark"; w.applyAppearance();
  ok("appearance dark → body.darkmode", d.body.classList.contains("darkmode"));
  g("db").appearance = "light"; w.applyAppearance();
  ok("appearance light → light-first cascade (no darkmode class)", !d.body.classList.contains("darkmode"));
  const realRandom = w.Math.random;
  g("db").randColor = true; w.Math.random = () => 0.99;
  const ghost = d.querySelector(".ghost-note"); ghost.click(); await sleep(60);
  const ed = d.querySelector(".card-el.editing");
  const dealt = ed && ed.style.getPropertyValue("--c");
  ok("randColor ON deals non-yellow to new card", !!dealt && dealt !== "" && !/F6DB74/i.test(dealt), "Math.random pinned hi → orange slot");
  w.Math.random = realRandom;
}

/* ================================================================= */
console.log("\n— FOLDABLE LANES —");
{
  const { w, g, d } = await boot();
  const lane = g("state").lanes[0];
  const lab = d.querySelector(".lane-label");
  lab.click(); await sleep(80);
  ok("tap lane tab folds lane (state persists)", g("state").folded && g("state").folded[lane.id] === true);
  ok("folded lane shows foldbar", !!d.querySelector(".foldbar"));
  d.querySelector(".lane-label").click(); await sleep(80);
  ok("tap again unfolds", g("state").folded[lane.id] === false);
}

/* ================================================================= */
/* ================================================================= */
console.log("\n— i30 REGRESSIONS (ghost-top, mask-atend, fan inert) —");
{
  const { w, g, d } = await boot();
  const lane = g("state").lanes[0].id, col = g("state").columns[0].id;
  for (let i = 0; i < 8; i++)
    g("state").cards.push({ id: "gx"+i, text: "g"+i, color: "yellow", blocked: false, lane, col, ord: 0 });
  g("state").cards.filter((c) => c.lane === lane && c.col === col).sort((a,b)=>a.ord-b.ord).forEach((c, i) => (c.ord = i));
  w.normalizeOrds(lane, col);
  w.render(); await sleep(120);
  const cell = d.querySelector('.cell[data-lane="' + lane + '"][data-col="' + col + '"]');
  ok("crowded cell: ghost + is FIRST child (reachable without scrolling)",
    cell.firstElementChild && cell.firstElementChild.classList.contains("ghost-note"));
  const win = cell.querySelector(".swin");
  ok("swin flags .atend at scroll bottom (mask released)",
    !!win && win.classList.contains("atend"), "jsdom rects 0 = always at end; real fade = device verdict");
  const cell2 = d.querySelector('.cell[data-lane="' + g("state").lanes[1].id + '"][data-col="' + col + '"]');
  ok("plain cell keeps ghost LAST (unchanged grammar)",
    cell2.lastElementChild && cell2.lastElementChild.classList.contains("ghost-note"));
  const pile = cell.querySelector(".pile");
  pile.click(); await sleep(80);
  const fanCard = d.querySelector("#pileFan .fgrid .card-el");
  pdown(w, fanCard); pup(w, fanCard);
  await sleep(120);
  ok("fan card tap opens NO editor (display-only, pull-to-top owns the tap)",
    !d.querySelector(".card-el.editing"));
}

/* ================================================================= */
console.log("\n— i31: BUILD TAG + STORAGE FALLBACK —");
{
  const { w, g, d } = await boot();
  ok("build tag renders current version in menu", /i32/.test(d.getElementById("buildTag").textContent));
  w.save(); await sleep(550); /* debounce 350ms */
  ok("localStorage fallback persists when window.storage absent (PWA path)",
    !!w.localStorage.getItem("board-v3"));
  const raw = JSON.parse(w.localStorage.getItem("board-v3"));
  ok("fallback round-trips through migrate", w.migrate(raw).v === 3);
}

console.log("\n" + "=".repeat(50));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail) { console.log("FAILED: " + failures.join(" · ")); process.exit(1); }
console.log("SUITE GREEN. Reminder: geometry (pile counts, flick aim, centerline feel) is DEVICE-ONLY truth.");
