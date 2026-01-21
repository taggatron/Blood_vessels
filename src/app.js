const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// -----------------------------
// Tabs
// -----------------------------
function initTabs(){
  const tabs = $$(".tab");
  const panels = $$(".panel");

  const setActive = (name) => {
    for (const t of tabs){
      const is = t.dataset.tab === name;
      t.setAttribute("aria-selected", is ? "true" : "false");
      t.classList.toggle("is-active", is);
    }
    for (const p of panels){
      const is = p.dataset.panel === name;
      p.hidden = !is;
    }

    // Kick layout-sensitive renders when tab becomes active
    if (name === "circulation") requestAnimationFrame(() => circ.ensureStarted());
  };

  for (const t of tabs){
    t.addEventListener("click", () => setActive(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const idx = tabs.indexOf(t);
      const next = e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      setActive(tabs[next].dataset.tab);
    });
  }

  // Allow deep-link via hash
  const initial = location.hash?.replace("#", "");
  const initialTab = (initial && ["vessels","assessment","circulation","about"].includes(initial)) ? initial : "vessels";
  setActive(initialTab);
}

// -----------------------------
// Vessel Explorer
// -----------------------------
const vesselData = {
  artery: {
    title: "Artery",
    summary: "Arteries carry blood away from the heart at high pressure. Their thick, elastic walls dampen pulse pressure and maintain flow between beats.",
    stats: [
      ["Pressure", "High"],
      ["Wall thickness", "Thick (strong tunica media)"],
      ["Elastic tissue", "High (especially near heart)"],
      ["Smooth muscle", "High"],
      ["Lumen", "Relatively smaller (vs. veins)"] ,
      ["Valves", "No"],
      ["Main function", "Transport + pressure regulation"],
      ["Flow", "Pulsatile"],
    ],
    color: "#ff3b5c",
    flowSpeed: 1.35,
    hasLayers: true,
    hasValves: false,
  },
  capillary: {
    title: "Capillary",
    summary: "Capillaries are microscopic vessels where exchange happens. Their walls are a single layer of endothelial cells, minimizing diffusion distance.",
    stats: [
      ["Pressure", "Low–moderate (drops across bed)"],
      ["Wall thickness", "Single-cell endothelium"],
      ["Elastic tissue", "Minimal"],
      ["Smooth muscle", "None"],
      ["Lumen", "Very small (RBCs pass single-file)"],
      ["Valves", "No"],
      ["Main function", "Exchange (gases, nutrients, waste)"],
      ["Flow", "Slow (maximizes exchange)"],
    ],
    color: "#ffffff",
    flowSpeed: 0.55,
    hasLayers: false,
    hasValves: false,
  },
  vein: {
    title: "Vein",
    summary: "Veins return blood to the heart at low pressure. Many veins have valves to prevent backflow, helping blood move against gravity.",
    stats: [
      ["Pressure", "Low"],
      ["Wall thickness", "Thinner (less tunica media)"],
      ["Elastic tissue", "Lower"],
      ["Smooth muscle", "Lower"],
      ["Lumen", "Large (blood reservoir)"],
      ["Valves", "Often present"],
      ["Main function", "Return + reservoir"],
      ["Flow", "Steadier (helped by muscle pump)"],
    ],
    color: "#3aa7ff",
    flowSpeed: 0.95,
    hasLayers: true,
    hasValves: true,
  },
};

const vessel = (() => {
  const svg = $("#vesselSvg");
  const gDrawing = $("#vesselDrawing", svg);
  const gLabels = $("#vesselLabels", svg);
  const gFlow = $("#vesselFlow", svg);
  const summary = $("#vesselSummary");
  const statsEl = $("#vesselStats");
  const toggleLayers = $("#toggleLayers");
  const toggleFlow = $("#toggleFlow");

  const state = {
    active: "artery",
    showLayers: true,
    animateFlow: true,
    t0: performance.now(),
    raf: null,
  };

  function renderStats(kind){
    const d = vesselData[kind];
    summary.textContent = d.summary;
    statsEl.innerHTML = "";
    for (const [k,v] of d.stats){
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `<div class="stat__k">${k}</div><div class="stat__v">${v}</div>`;
      statsEl.appendChild(div);
    }
  }

  function clear(g){
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  function text(x,y,str,opts={}){
    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    if (opts.anchor) t.setAttribute("text-anchor", opts.anchor);
    if (opts.weight) t.setAttribute("font-weight", String(opts.weight));
    if (opts.opacity != null) t.setAttribute("opacity", String(opts.opacity));
    t.textContent = str;
    return t;
  }

  function circle(cx,cy,r,cls,fill){
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", String(r));
    if (cls) c.setAttribute("class", cls);
    if (fill) c.setAttribute("fill", fill);
    return c;
  }

  function path(d, cls){
    const p = document.createElementNS("http://www.w3.org/2000/svg","path");
    p.setAttribute("d", d);
    if (cls) p.setAttribute("class", cls);
    return p;
  }

  function draw(kind){
    const d = vesselData[kind];
    clear(gDrawing);
    clear(gLabels);

    // Cross section centered
    const cx = 280;
    const cy = 190;

    // Geometry per vessel
    const geom = {
      artery: { outer: 130, media: 112, intima: 98, lumen: 68 },
      capillary: { outer: 90, media: 0, intima: 0, lumen: 66 },
      vein: { outer: 118, media: 102, intima: 92, lumen: 78 },
    }[kind];

    const showLayers = state.showLayers && d.hasLayers;

    // Background caption
    gLabels.appendChild(text(22, 40, `${d.title} cross section`, { weight: 700 }));
    gLabels.appendChild(text(22, 62, showLayers ? "Layers shown" : "Simplified wall shown", { opacity: 0.75 }));

    // Outer wall
    const outerFill = kind === "artery" ? "url(#wallGrad)" : (kind === "capillary" ? "url(#wallGrad2)" : "url(#wallGrad3)");
    gDrawing.appendChild(circle(cx, cy, geom.outer, null, outerFill));

    // Layers (artery + vein)
    if (showLayers){
      gDrawing.appendChild(circle(cx, cy, geom.media, null, "rgba(255,255,255,0.14)"));
      gDrawing.appendChild(circle(cx, cy, geom.intima, null, "rgba(0,0,0,0.12)"));

      gLabels.appendChild(text(520, 140, "Tunica externa", { opacity: 0.8 }));
      gLabels.appendChild(text(520, 190, "Tunica media", { opacity: 0.8 }));
      gLabels.appendChild(text(520, 235, "Tunica intima", { opacity: 0.8 }));

      // guide lines
      const ln1 = path(`M 430 132 C 380 132 360 132 ${cx + geom.outer} ${cy - 40}`, null);
      const ln2 = path(`M 430 184 C 380 184 360 184 ${cx + geom.media} ${cy + 0}`, null);
      const ln3 = path(`M 430 230 C 380 230 360 230 ${cx + geom.intima} ${cy + 36}`, null);
      for (const ln of [ln1, ln2, ln3]){
        ln.setAttribute("fill","none");
        ln.setAttribute("stroke","rgba(2,6,23,0.18)");
        ln.setAttribute("stroke-width","2");
        gDrawing.appendChild(ln);
      }
    } else {
      // Single wall ring for capillary (or simplified view)
      const wallRing = circle(cx, cy, geom.outer - 10, null, "rgba(0,0,0,0.10)");
      gDrawing.appendChild(wallRing);
    }

    // Lumen
    gDrawing.appendChild(circle(cx, cy, geom.lumen, null, "rgba(10,18,40,0.55)"));

    // RBCs in lumen (static)
    const rbcCount = kind === "capillary" ? 10 : 14;
    for (let i=0;i<rbcCount;i++){
      const a = (i / rbcCount) * Math.PI * 2;
      const rr = geom.lumen * 0.62;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const r = kind === "capillary" ? 6 : 7;
      const col = kind === "artery" ? "rgba(255,59,92,0.78)" : (kind === "vein" ? "rgba(58,167,255,0.75)" : "rgba(255,255,255,0.68)");
      gDrawing.appendChild(circle(x, y, r, null, col));
    }

    // Vein valves (stylized)
    if (d.hasValves){
      const valve1 = path(`M ${cx - 12} ${cy - 8} Q ${cx - 42} ${cy - 22} ${cx - 52} ${cy - 4} Q ${cx - 36} ${cy + 0} ${cx - 12} ${cy - 8}`, null);
      const valve2 = path(`M ${cx + 12} ${cy - 8} Q ${cx + 42} ${cy - 22} ${cx + 52} ${cy - 4} Q ${cx + 36} ${cy + 0} ${cx + 12} ${cy - 8}`, null);
      for (const v of [valve1, valve2]){
        v.setAttribute("fill","rgba(255,255,255,0.70)");
        v.setAttribute("stroke","rgba(2,6,23,0.16)");
        v.setAttribute("stroke-width","2");
        gDrawing.appendChild(v);
      }
      gLabels.appendChild(text(520, 280, "Valves prevent backflow", { opacity: 0.8 }));
    }

    // Caption right
    gLabels.appendChild(text(520, 92, kind === "artery" ? "High pressure" : (kind === "vein" ? "Low pressure" : "Exchange surface"), { weight: 700 }));
  }

  // Flow dots moving in a circle
  const flowDots = [];
  function initFlowDots(){
    clear(gFlow);
    flowDots.length = 0;
    const baseCount = 22;
    for (let i=0;i<baseCount;i++){
      const c = circle(0,0,4,null,"rgba(255,255,255,0.0)");
      gFlow.appendChild(c);
      flowDots.push({ el:c, phase: i / baseCount });
    }
  }

  function animate(now){
    state.raf = requestAnimationFrame(animate);
    if (!state.animateFlow) return;

    const kind = state.active;
    const d = vesselData[kind];
    const cx = 280;
    const cy = 190;
    const radius = { artery: 84, capillary: 56, vein: 92 }[kind];
    const speed = d.flowSpeed;
    const t = (now - state.t0) / 1000;

    for (const dot of flowDots){
      const a = (dot.phase * Math.PI * 2) + t * speed;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      dot.el.setAttribute("cx", String(x));
      dot.el.setAttribute("cy", String(y));

      const col = kind === "artery" ? "rgba(255,59,92,0.72)" : (kind === "vein" ? "rgba(58,167,255,0.68)" : "rgba(255,255,255,0.62)");
      dot.el.setAttribute("fill", col);
    }
  }

  function set(kind){
    state.active = kind;
    renderStats(kind);
    draw(kind);
  }

  function init(){
    initFlowDots();
    renderStats(state.active);
    draw(state.active);
    state.raf = requestAnimationFrame(animate);

    toggleLayers.addEventListener("change", () => {
      state.showLayers = toggleLayers.checked;
      draw(state.active);
    });

    toggleFlow.addEventListener("change", () => {
      state.animateFlow = toggleFlow.checked;
      gFlow.style.display = state.animateFlow ? "" : "none";
    });

    $$(".chip").forEach((b) => {
      b.addEventListener("click", () => {
        $$(".chip").forEach(x => x.classList.remove("is-active"));
        b.classList.add("is-active");
        set(b.dataset.vessel);
      });
    });

    $("#resetVesselBtn").addEventListener("click", () => {
      state.active = "artery";
      $$(".chip").forEach(x => x.classList.toggle("is-active", x.dataset.vessel === "artery"));
      toggleLayers.checked = true;
      toggleFlow.checked = true;
      state.showLayers = true;
      state.animateFlow = true;
      gFlow.style.display = "";
      set("artery");
    });

    $("#compareBtn").addEventListener("click", () => {
      const tableWrap = $("#compareTable");
      tableWrap.hidden = !tableWrap.hidden;
      if (!tableWrap.hidden) renderCompareTable(tableWrap);
    });
  }

  function renderCompareTable(root){
    const rows = [
      ["Pressure", "High", "Low–moderate", "Low"],
      ["Wall thickness", "Thick", "Very thin", "Thin"],
      ["Valves", "No", "No", "Often"],
      ["Primary role", "Transport/pressure", "Exchange", "Return/reservoir"],
      ["Typical flow", "Pulsatile", "Slow", "Steady"],
    ];

    root.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Artery</th>
            <th>Capillary</th>
            <th>Vein</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r[0]}</td>
              <td>${r[1]}</td>
              <td>${r[2]}</td>
              <td>${r[3]}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  return { init, set };
})();

// -----------------------------
// Drag & Drop Assessment
// -----------------------------
const assessment = (() => {
  const featureBank = $("#featureBank");
  const feedback = $("#assessmentFeedback");
  const scoreLine = $("#scoreLine");
  const explain = $("#assessmentExplain");

  const touchState = {
    active: false,
    pointerId: null,
    srcPill: null,
    ghost: null,
    offsetX: 0,
    offsetY: 0,
    lastOverZone: null,
  };

  let pickedPill = null;

  const items = [
    { id: "thick_media", label: "Thick tunica media (muscle)", correct: "artery" },
    { id: "elastic_recoil", label: "Elastic recoil smooths pulse", correct: "artery" },
    { id: "high_pressure", label: "High pressure flow", correct: "artery" },
    { id: "arteriole_control", label: "Arterioles regulate resistance", correct: "artery" },

    { id: "one_cell", label: "One-cell thick endothelium", correct: "capillary" },
    { id: "diffusion", label: "Short diffusion distance", correct: "capillary" },
    { id: "exchange", label: "Exchange of gases/nutrients", correct: "capillary" },
    { id: "slow_flow", label: "Slow flow for exchange", correct: "capillary" },

    { id: "valves", label: "Valves prevent backflow", correct: "vein" },
    { id: "large_lumen", label: "Large lumen (reservoir)", correct: "vein" },
    { id: "low_pressure", label: "Low pressure return", correct: "vein" },
    { id: "muscle_pump", label: "Skeletal muscle pump helps flow", correct: "vein" },
  ];

  const explanations = {
    artery: {
      title: "Artery: built for pressure",
      text: "Thick smooth muscle and elastic tissue allow arteries to handle high pressure and regulate flow distribution via arterioles.",
    },
    capillary: {
      title: "Capillary: built for exchange",
      text: "A one-cell wall reduces diffusion distance; slow flow and huge total surface area support exchange with tissues.",
    },
    vein: {
      title: "Vein: built for return",
      text: "Low pressure return uses valves + muscle pump; large lumens hold much of the blood volume at rest.",
    },
  };

  function makePill(item){
    const div = document.createElement("div");
    div.className = "pill";
    div.textContent = item.label;
    div.draggable = true;
    div.dataset.itemId = item.id;
    div.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", item.id);
      e.dataTransfer.effectAllowed = "move";
    });

    // Touch/pen: custom drag. Mouse keeps native HTML5 drag.
    div.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      startTouchDrag(e, div);
    });

    // Tap-to-pick (mobile friendly). Clicking a zone will place it.
    div.addEventListener("click", (e) => {
      // If a touch drag just happened, don't treat it as a pick.
      if (touchState.active) return;
      e.preventDefault();
      setPicked(div);
    });
    return div;
  }

  function setPicked(pill){
    if (pickedPill === pill){
      pill.classList.remove("is-picked");
      pickedPill = null;
      setTapTargetsActive(false);
      return;
    }

    if (pickedPill) pickedPill.classList.remove("is-picked");
    pickedPill = pill;
    pickedPill.classList.add("is-picked");
    setTapTargetsActive(true);
    feedback.innerHTML = `<div class="muted">Tap a dropzone to place: <strong>Artery</strong>, <strong>Capillary</strong>, or <strong>Vein</strong>. (Tap the pill again to cancel.)</div>`;
  }

  function setTapTargetsActive(isActive){
    for (const z of $$(".dropzone")) z.classList.toggle("is-target", isActive);
  }

  function placePillInZone(pill, zone){
    const body = $(`[data-drop-body="${zone}"]`);
    if (body) body.appendChild(pill);
  }

  function placePillInBank(pill){
    featureBank.appendChild(pill);
  }

  function elementAtClientPoint(x, y){
    // Some browsers return null in rare cases (e.g., during scroll). Guard.
    return document.elementFromPoint(x, y);
  }

  function dropTargetFromPoint(x, y){
    const el = elementAtClientPoint(x, y);
    if (!el) return { type: "none" };

    const zone = el.closest?.(".dropzone");
    if (zone?.dataset?.drop) return { type: "zone", zone: zone.dataset.drop, el: zone };

    const bank = el.closest?.("#featureBank");
    if (bank) return { type: "bank" };

    return { type: "none" };
  }

  function updateOverZone(zoneEl){
    if (touchState.lastOverZone && touchState.lastOverZone !== zoneEl){
      touchState.lastOverZone.classList.remove("is-over");
    }
    touchState.lastOverZone = zoneEl;
    if (zoneEl) zoneEl.classList.add("is-over");
  }

  function cleanupTouchDrag(){
    if (touchState.lastOverZone) touchState.lastOverZone.classList.remove("is-over");
    touchState.lastOverZone = null;

    if (touchState.ghost){
      touchState.ghost.remove();
      touchState.ghost = null;
    }
    if (touchState.srcPill){
      touchState.srcPill.classList.remove("is-drag-source");
    }

    touchState.active = false;
    touchState.pointerId = null;
    touchState.srcPill = null;
  }

  function startTouchDrag(e, pill){
    // Cancel pick mode if active
    if (pickedPill) {
      pickedPill.classList.remove("is-picked");
      pickedPill = null;
      setTapTargetsActive(false);
    }

    e.preventDefault();
    touchState.active = true;
    touchState.pointerId = e.pointerId;
    touchState.srcPill = pill;

    const rect = pill.getBoundingClientRect();
    touchState.offsetX = e.clientX - rect.left;
    touchState.offsetY = e.clientY - rect.top;

    const ghost = pill.cloneNode(true);
    ghost.classList.add("pill-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    touchState.ghost = ghost;

    pill.classList.add("is-drag-source");

    // Position once
    moveTouchDrag(e);

    try { pill.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function moveTouchDrag(e){
    if (!touchState.active || e.pointerId !== touchState.pointerId) return;
    if (!touchState.ghost) return;

    e.preventDefault();

    const x = e.clientX - touchState.offsetX;
    const y = e.clientY - touchState.offsetY;
    touchState.ghost.style.left = `${Math.round(x)}px`;
    touchState.ghost.style.top = `${Math.round(y)}px`;

    const tgt = dropTargetFromPoint(e.clientX, e.clientY);
    updateOverZone(tgt.type === "zone" ? tgt.el : null);
  }

  function endTouchDrag(e){
    if (!touchState.active || e.pointerId !== touchState.pointerId) return;
    e.preventDefault();

    const tgt = dropTargetFromPoint(e.clientX, e.clientY);
    const pill = touchState.srcPill;

    if (pill){
      if (tgt.type === "zone") placePillInZone(pill, tgt.zone);
      else if (tgt.type === "bank") placePillInBank(pill);
    }

    cleanupTouchDrag();
  }

  function findItem(id){
    return items.find(x => x.id === id);
  }

  function allDropBodies(){
    return $$('[data-drop-body]');
  }

  function reset(){
    feedback.textContent = "";
    featureBank.innerHTML = "";
    for (const b of allDropBodies()) b.innerHTML = "";
    if (pickedPill) pickedPill = null;
    setTapTargetsActive(false);
    for (const it of items) featureBank.appendChild(makePill(it));
    updateScoreLine();
    renderExplain();
  }

  function updateScoreLine(score=0, total=items.length){
    scoreLine.textContent = `Score: ${score} / ${total}`;
  }

  function renderExplain(){
    explain.innerHTML = "";
    for (const k of ["artery","capillary","vein"]){
      const c = document.createElement("div");
      c.className = "callout";
      c.innerHTML = `<strong>${explanations[k].title}</strong><p>${explanations[k].text}</p>`;
      explain.appendChild(c);
    }
  }

  function setupDnD(){
    const zones = $$(".dropzone");
    for (const z of zones){
      z.addEventListener("dragover", (e) => {
        e.preventDefault();
        z.classList.add("is-over");
        e.dataTransfer.dropEffect = "move";
      });
      z.addEventListener("dragleave", () => z.classList.remove("is-over"));
      z.addEventListener("drop", (e) => {
        e.preventDefault();
        z.classList.remove("is-over");
        const id = e.dataTransfer.getData("text/plain");
        if (!id) return;
        const pill = $(`.pill[data-item-id="${CSS.escape(id)}"]`);
        const body = $("[data-drop-body=\"" + z.dataset.drop + "\"]");
        if (pill && body) body.appendChild(pill);
      });
    }

    // Allow dropping back to bank
    featureBank.addEventListener("dragover", (e) => { e.preventDefault(); });
    featureBank.addEventListener("drop", (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      const pill = $(`.pill[data-item-id="${CSS.escape(id)}"]`);
      if (pill) featureBank.appendChild(pill);
    });
  }

  function setupTouchAndClickDnD(){
    // Pointer drag listeners (document-level so we still receive events while moving)
    document.addEventListener("pointermove", moveTouchDrag, { passive: false });
    document.addEventListener("pointerup", endTouchDrag, { passive: false });
    document.addEventListener("pointercancel", cleanupTouchDrag, { passive: false });

    // Tap-to-place: tap a zone to drop picked pill.
    for (const z of $$(".dropzone")){
      z.addEventListener("click", () => {
        if (!pickedPill) return;
        placePillInZone(pickedPill, z.dataset.drop);
        pickedPill.classList.remove("is-picked");
        pickedPill = null;
        setTapTargetsActive(false);
        feedback.innerHTML = `<div class="muted">Placed. Pick another feature to continue.</div>`;
      });
    }

    // Tap the bank background to return a picked pill.
    featureBank.addEventListener("click", (e) => {
      if (!pickedPill) return;
      // Ignore clicks directly on pills (they toggle pick)
      if (e.target?.closest?.(".pill")) return;
      placePillInBank(pickedPill);
      pickedPill.classList.remove("is-picked");
      pickedPill = null;
      setTapTargetsActive(false);
      feedback.innerHTML = `<div class="muted">Returned to bank.</div>`;
    });
  }

  function check(){
    let score = 0;
    const misses = [];

    for (const zone of ["artery","capillary","vein"]){
      const body = $(`[data-drop-body="${zone}"]`);
      const placed = $$(".pill", body).map(p => p.dataset.itemId);
      for (const pid of placed){
        const it = findItem(pid);
        if (!it) continue;
        if (it.correct === zone) score++;
        else misses.push({ label: it.label, isIn: zone, shouldBe: it.correct });
      }
    }

    updateScoreLine(score);

    if (score === items.length){
      feedback.innerHTML = `<div class="good">Perfect: all features matched correctly.</div>`;
      return;
    }

    const missLine = misses.slice(0,4).map(m => `<li>${m.label} → should be <strong>${m.shouldBe}</strong></li>`).join("");
    feedback.innerHTML = `
      <div class="bad">Not quite. You have ${items.length - score} incorrect or unplaced.</div>
      ${misses.length ? `<ul>${missLine}</ul>` : ""}
      <div class="muted">Tip: focus on pressure (artery), exchange (capillary), and valves/reservoir (vein).</div>
    `;
  }

  function hint(){
    // Pick first misplaced item and tell its correct zone (without moving it)
    const placements = new Map();
    for (const zone of ["artery","capillary","vein"]){
      const body = $(`[data-drop-body="${zone}"]`);
      for (const p of $$(".pill", body)) placements.set(p.dataset.itemId, zone);
    }

    const firstWrong = items.find(it => placements.has(it.id) && placements.get(it.id) !== it.correct);
    const firstUnplaced = items.find(it => !placements.has(it.id) && !$( `.pill[data-item-id="${CSS.escape(it.id)}"]`, featureBank));

    if (firstWrong){
      feedback.innerHTML = `<div class="bad">Hint: “${firstWrong.label}” belongs in <strong>${firstWrong.correct}</strong>.</div>`;
      return;
    }

    // If nothing is wrong but not complete, hint about one still in bank
    const inBank = items.find(it => $( `.pill[data-item-id="${CSS.escape(it.id)}"]`, featureBank));
    if (inBank){
      feedback.innerHTML = `<div class="muted">Hint: try placing “${inBank.label}”. Think: <strong>${inBank.correct}</strong>.</div>`;
      return;
    }

    feedback.textContent = "Hint: you’re close — check each zone for mismatches.";
  }

  function init(){
    setupDnD();
    setupTouchAndClickDnD();
    reset();

    $("#checkBtn").addEventListener("click", check);
    $("#resetAssessmentBtn").addEventListener("click", reset);
    $("#hintBtn").addEventListener("click", hint);
  }

  return { init, reset };
})();

// -----------------------------
// Circulation simulation
// -----------------------------
const circ = (() => {
  const svg = $("#circSvg");
  const gPaths = $("#circPaths", svg);
  const gVessels = $("#circVessels", svg);
  const gParticles = $("#circParticles", svg);
  const gLabels = $("#circLabels", svg);

  const bpm = $("#bpm");
  const resistance = $("#resistance");
  const particlesSlider = $("#particles");
  const bpmVal = $("#bpmVal");
  const resVal = $("#resVal");
  const pVal = $("#pVal");
  const toggleO2 = $("#toggleO2");
  const toggleNames = $("#toggleNames");

  const restartBtn = $("#restartSimBtn");
  const pauseBtn = $("#pauseBtn");

  const state = {
    started: false,
    paused: false,
    raf: null,
    t0: performance.now(),
    selectedOrgan: null,
    paths: {},
    particles: [],
  };

  function clear(g){ while(g.firstChild) g.removeChild(g.firstChild); }

  function svgPath(d){
    const p = document.createElementNS("http://www.w3.org/2000/svg","path");
    p.setAttribute("d", d);
    return p;
  }

  function addVisiblePath(d, cls){
    const p = svgPath(d);
    p.setAttribute("class", `circ-vessel ${cls}`);
    gVessels.appendChild(p);
    return p;
  }

  function addHiddenPath(id, d){
    const p = svgPath(d);
    p.dataset.pathId = id;
    gPaths.appendChild(p);
    return p;
  }

  function labelChip(x,y,text){
    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
    const t = document.createElementNS("http://www.w3.org/2000/svg","text");

    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("rx", "10");
    r.setAttribute("width", String(text.length * 7.2 + 18));
    r.setAttribute("height", "22");
    r.setAttribute("class", "chipLabel");
    r.setAttribute("fill", "rgba(255,255,255,0.88)");
    r.setAttribute("stroke", "rgba(2,6,23,0.12)");

    t.setAttribute("x", String(x + 10));
    t.setAttribute("y", String(y + 15));
    t.textContent = text;

    g.appendChild(r);
    g.appendChild(t);
    gLabels.appendChild(g);
  }

  function organNode(id, x, y, name){
    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    g.setAttribute("class", "organ");
    g.dataset.organ = id;

    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", "22");
    c.setAttribute("fill", "rgba(255,255,255,0.92)");
    c.setAttribute("stroke", "rgba(2,6,23,0.14)");

    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y + 4));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-weight", "700");
    t.setAttribute("fill", "rgba(2,6,23,0.78)");
    t.textContent = name;

    g.appendChild(c);
    g.appendChild(t);

    g.addEventListener("click", () => {
      state.selectedOrgan = state.selectedOrgan === id ? null : id;
      updateHighlight();
    });

    return g;
  }

  function lungsNode(x, y){
    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    g.setAttribute("class", "organ");
    g.dataset.organ = "lungs";

    const lobe = (cx, cy, rx, ry) => {
      const e = document.createElementNS("http://www.w3.org/2000/svg","ellipse");
      e.setAttribute("cx", String(cx));
      e.setAttribute("cy", String(cy));
      e.setAttribute("rx", String(rx));
      e.setAttribute("ry", String(ry));
      e.setAttribute("fill", "rgba(255,255,255,0.92)");
      e.setAttribute("stroke", "rgba(2,6,23,0.14)");
      e.setAttribute("stroke-width", "2");
      return e;
    };

    // Two lobes + a simple trachea/bronchi hint.
    const left = lobe(x - 18, y + 6, 28, 34);
    const right = lobe(x + 18, y + 6, 28, 34);

    const trachea = document.createElementNS("http://www.w3.org/2000/svg","path");
    trachea.setAttribute(
      "d",
      `M ${x} ${y - 48} ` +
      `C ${x} ${y - 24}, ${x} ${y - 10}, ${x - 10} ${y} ` +
      `M ${x} ${y - 24} C ${x} ${y - 10}, ${x} ${y - 10}, ${x + 10} ${y}`
    );
    trachea.setAttribute("fill", "none");
    trachea.setAttribute("stroke", "rgba(2,6,23,0.20)");
    trachea.setAttribute("stroke-width", "3");
    trachea.setAttribute("stroke-linecap", "round");

    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y + 54));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-weight", "700");
    t.setAttribute("fill", "rgba(2,6,23,0.78)");
    t.textContent = "Lungs";

    g.appendChild(left);
    g.appendChild(right);
    g.appendChild(trachea);
    g.appendChild(t);

    g.addEventListener("click", () => {
      state.selectedOrgan = state.selectedOrgan === "lungs" ? null : "lungs";
      updateHighlight();
    });

    return g;
  }

  function updateHighlight(){
    // Make selected organ’s capillary bed brighter
    const selected = state.selectedOrgan;
    for (const p of $$(".circ-vessel", gVessels)){
      const org = p.dataset.organ;
      if (!org) continue;
      const isSel = selected && org === selected;
      p.style.opacity = !selected ? "1" : (isSel ? "1" : "0.30");
    }
  }

  function buildScene(){
    clear(gPaths); clear(gVessels); clear(gParticles); clear(gLabels);

    // Coordinate system
    // Heart at left center, lungs above, organs to the right.
    const heart = { x: 180, y: 300 };
    const lungs = { x: 300, y: 150 };

    // Heart shape (simple)
    const heartG = document.createElementNS("http://www.w3.org/2000/svg","g");
    heartG.dataset.node = "heart";
    const heartPath = svgPath(
      `M ${heart.x} ${heart.y} ` +
      `c -34 -44 -92 -18 -92 34 ` +
      `c 0 54 56 86 92 118 ` +
      `c 36 -32 92 -64 92 -118 ` +
      `c 0 -52 -58 -78 -92 -34 z`
    );
    heartPath.setAttribute("fill", "rgba(255,49,84,0.32)");
    heartPath.setAttribute("stroke", "rgba(255,49,84,0.90)");
    heartPath.setAttribute("stroke-width", "3");
    heartG.appendChild(heartPath);
    gVessels.appendChild(heartG);

    // Lungs drawing
    gVessels.appendChild(lungsNode(lungs.x, lungs.y));

    // Nodes (organs)
    const organs = [
      { id: "brain", x: 740, y: 120, name: "Brain" },
      { id: "kidney", x: 780, y: 260, name: "Kidney" },
      { id: "gut", x: 700, y: 360, name: "Gut" },
      { id: "muscle", x: 820, y: 430, name: "Muscle" },
    ];

    const organGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
    for (const o of organs) organGroup.appendChild(organNode(o.id, o.x, o.y, o.name));
    gVessels.appendChild(organGroup);

    // Visible vessel network (stylized)
    // Pulmonary loop: heart -> lungs -> heart
    const dPulmA = `M ${heart.x + 90} ${heart.y - 40} C ${heart.x + 170} ${heart.y - 140}, ${lungs.x - 40} ${lungs.y + 10}, ${lungs.x} ${lungs.y}`;
    const dPulmV = `M ${lungs.x} ${lungs.y} C ${lungs.x - 40} ${lungs.y + 70}, ${heart.x + 160} ${heart.y + 0}, ${heart.x + 85} ${heart.y + 30}`;

    addVisiblePath(dPulmA, "venous"); // deoxygenated to lungs
    addVisiblePath(dPulmV, "arterial"); // oxygenated back

    // Lungs capillary bed
    const dLungCap = `M ${lungs.x - 40} ${lungs.y + 10} C ${lungs.x - 10} ${lungs.y + 40}, ${lungs.x + 10} ${lungs.y - 20}, ${lungs.x + 40} ${lungs.y + 10}`;
    const lungCapP = addVisiblePath(dLungCap, "capillary");
    lungCapP.dataset.organ = "lungs";

    // Systemic: heart -> aorta -> organ arteries -> organ capillaries -> veins -> vena cava -> heart
    const aorta = `M ${heart.x + 85} ${heart.y + 10} C ${heart.x + 220} ${heart.y - 40}, 380 260, 520 250`;
    addVisiblePath(aorta, "arterial");

    const venaCava = `M 520 360 C 410 380, ${heart.x + 220} ${heart.y + 120}, ${heart.x - 10} ${heart.y + 90}`;
    addVisiblePath(venaCava, "venous");

    function addOrganCapillaryNet(o){
      const x = o.x;
      const y = o.y;
      const k = 0.5522847498;

      const addCap = (d) => {
        const p = addVisiblePath(d, "capillary");
        p.dataset.organ = o.id;
        return p;
      };

      const loop = (r, dx = 0, dy = 0) => {
        const cx = x + dx;
        const cy = y + dy;
        const o2 = r * k;
        return `M ${cx - r} ${cy} ` +
          `C ${cx - r} ${cy - o2}, ${cx - o2} ${cy - r}, ${cx} ${cy - r} ` +
          `C ${cx + o2} ${cy - r}, ${cx + r} ${cy - o2}, ${cx + r} ${cy} ` +
          `C ${cx + r} ${cy + o2}, ${cx + o2} ${cy + r}, ${cx} ${cy + r} ` +
          `C ${cx - o2} ${cy + r}, ${cx - r} ${cy + o2}, ${cx - r} ${cy} Z`;
      };

      // Looped “net” feel: multiple offset loops + weave connectors.
      addCap(loop(30, -2, 0));
      addCap(loop(22, 6, -2));
      addCap(loop(15, -6, 7));

      // Weave paths (open curves) to suggest a mesh.
      addCap(`M ${x - 32} ${y} C ${x - 10} ${y - 24}, ${x + 10} ${y + 24}, ${x + 32} ${y}`);
      addCap(`M ${x} ${y - 30} C ${x + 24} ${y - 8}, ${x - 24} ${y + 8}, ${x} ${y + 30}`);
      addCap(`M ${x - 20} ${y - 14} C ${x - 6} ${y - 2}, ${x + 6} ${y + 2}, ${x + 20} ${y + 14}`);
    }

    // Branches to organs
    const branches = [];
    for (const o of organs){
      const art = `M 520 250 C 600 240, ${o.x - 60} ${o.y}, ${o.x - 24} ${o.y}`;
      const ven = `M ${o.x - 24} ${o.y} C ${o.x - 70} ${o.y + 30}, 620 360, 520 360`;
      branches.push({ o, art, ven });
      const artP = addVisiblePath(art, "arterial");
      const venP = addVisiblePath(ven, "venous");
      artP.dataset.organ = o.id;
      venP.dataset.organ = o.id;

      addOrganCapillaryNet(o);
    }

    // Labels
    labelChip(48, 40, "Pulmonary loop (heart ↔ lungs)");
    labelChip(48, 70, "Systemic loop (heart ↔ organs)");
    labelChip(622, 470, "Click an organ");

    // Hidden paths for particles
    // We model two circuits:
    // 1) Deoxygenated: heart -> pulmonary artery -> lungs capillaries -> pulmonary vein -> heart
    // 2) Oxygenated: heart -> aorta -> organ artery -> cap bed -> organ vein -> vena cava -> heart

    // Pulmonary (closed path)
    const pulmLoop = `M ${heart.x + 90} ${heart.y - 40} C ${heart.x + 170} ${heart.y - 140}, ${lungs.x - 40} ${lungs.y + 10}, ${lungs.x} ${lungs.y} ` +
      `C ${lungs.x - 40} ${lungs.y + 70}, ${heart.x + 160} ${heart.y + 0}, ${heart.x + 85} ${heart.y + 30} ` +
      `C ${heart.x + 40} ${heart.y + 50}, ${heart.x + 40} ${heart.y - 10}, ${heart.x + 90} ${heart.y - 40} Z`;

    // A single hidden loop for pulmonary particles
    state.paths.pulmonary = addHiddenPath("pulmonary", pulmLoop);

    // Systemic main loop
    const sysMain = `M ${heart.x + 85} ${heart.y + 10} C ${heart.x + 220} ${heart.y - 40}, 380 260, 520 250 ` +
      `C 610 246, 620 280, 520 360 ` +
      `C 410 380, ${heart.x + 220} ${heart.y + 120}, ${heart.x - 10} ${heart.y + 90} ` +
      `C ${heart.x - 20} ${heart.y + 60}, ${heart.x + 10} ${heart.y + 30}, ${heart.x + 85} ${heart.y + 10} Z`;
    state.paths.systemic = addHiddenPath("systemic", sysMain);

    // Extra organ capillary loops (each organ gets its own mini-loop for oxygen drop)
    state.paths.organs = {};
    for (const o of organs){
      // A longer “loopy” path so particles move like they’re traversing a capillary mesh.
      const x = o.x;
      const y = o.y;
      const dOrg = `M ${x - 28} ${y} ` +
        `C ${x - 28} ${y - 24}, ${x - 8} ${y - 24}, ${x - 8} ${y} ` +
        `C ${x - 8} ${y + 24}, ${x + 12} ${y + 24}, ${x + 12} ${y} ` +
        `C ${x + 12} ${y - 24}, ${x + 32} ${y - 24}, ${x + 32} ${y} ` +
        `C ${x + 32} ${y + 18}, ${x + 18} ${y + 18}, ${x + 18} ${y} ` +
        `C ${x + 18} ${y - 18}, ${x + 4} ${y - 18}, ${x + 4} ${y} ` +
        `C ${x + 4} ${y + 18}, ${x - 10} ${y + 18}, ${x - 10} ${y} ` +
        `C ${x - 10} ${y - 18}, ${x - 28} ${y - 18}, ${x - 28} ${y} Z`;
      state.paths.organs[o.id] = addHiddenPath(`org-${o.id}`, dOrg);
    }

    // Lungs capillary loop
    const dLungs = `M ${lungs.x - 30} ${lungs.y} C ${lungs.x - 10} ${lungs.y - 30}, ${lungs.x + 10} ${lungs.y + 30}, ${lungs.x + 30} ${lungs.y} ` +
      `C ${lungs.x + 10} ${lungs.y + 18}, ${lungs.x - 10} ${lungs.y - 18}, ${lungs.x - 30} ${lungs.y} Z`;
    state.paths.lungsBed = addHiddenPath("lungsBed", dLungs);
  }

  function makeParticle(kind){
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("r", "3.6");
    c.setAttribute("fill", "rgba(255,255,255,0.85)");
    gParticles.appendChild(c);

    return {
      el: c,
      circuit: kind, // 'pulmonary' or 'systemic'
      s: Math.random(),
      o2: kind === "systemic" ? 1 : 0, // 1 oxygenated, 0 deoxygenated
      targetOrgan: null,
      phase: "main", // main, organ, lungs
      phaseT: 0,
    };
  }

  function computeSpeed(){
    const bpmNum = Number(bpm.value);
    const res = Number(resistance.value);

    // Speed proxy: higher bpm = faster, higher resistance = slower.
    const bpmFactor = bpmNum / 75;
    const resFactor = 1 - (res / 140);
    return Math.max(0.20, bpmFactor * resFactor);
  }

  function colorFor(p){
    if (!toggleO2.checked) return "rgba(255,255,255,0.82)";
    const t = p.o2;
    // Interpolate between blue (0) and red (1)
    const r = Math.round(58 + (255 - 58) * t);
    const g = Math.round(167 + (59 - 167) * t);
    const b = Math.round(255 + (92 - 255) * t);
    return `rgba(${r},${g},${b},0.88)`;
  }

  function rebuildParticles(){
    clear(gParticles);
    state.particles = [];

    const count = Number(particlesSlider.value);
    const half = Math.floor(count * 0.42);

    // Mix circuits: systemic dominates (more blood volume)
    for (let i=0;i<count;i++){
      const circuit = i < half ? "pulmonary" : "systemic";
      const p = makeParticle(circuit);
      p.s = Math.random();
      if (circuit === "systemic") p.o2 = 1;
      state.particles.push(p);
    }

    // Update UI
    pVal.textContent = String(count);
  }

  function updateUI(){
    bpmVal.textContent = `${bpm.value} bpm`;
    resVal.textContent = `${resistance.value}%`;
    pVal.textContent = String(particlesSlider.value);

    gLabels.style.display = toggleNames.checked ? "" : "none";
  }

  function moveAlongPath(p, pathEl, s){
    const len = pathEl.getTotalLength();
    const pt = pathEl.getPointAtLength((s % 1) * len);
    p.el.setAttribute("cx", String(pt.x));
    p.el.setAttribute("cy", String(pt.y));
  }

  function pickOrgan(){
    const ids = Object.keys(state.paths.organs || {});
    return ids[Math.floor(Math.random() * ids.length)];
  }

  function tick(now){
    state.raf = requestAnimationFrame(tick);
    if (state.paused) return;

    const speed = computeSpeed();
    const dt = Math.min(0.040, (now - state.t0) / 1000);
    state.t0 = now;

    // Heart "pump" animation scales with bpm
    const heartG = $("g[data-node='heart']", gVessels);
    if (heartG){
      const bpmNum = Number(bpm.value);
      const f = bpmNum / 60;
      const pulse = 1 + 0.06 * Math.sin(now / 1000 * Math.PI * 2 * f);
      heartG.setAttribute("transform", `translate(180 300) scale(${pulse}) translate(-180 -300)`);
    }

    // Particle update
    for (const p of state.particles){
      // Advance along main loop
      p.s += dt * speed * (p.circuit === "pulmonary" ? 0.34 : 0.26);

      // Branch logic: systemic particles occasionally detour through an organ capillary loop
      if (p.circuit === "systemic"){
        if (p.phase === "main" && Math.random() < dt * 0.35){
          p.phase = "organ";
          p.phaseT = 0;
          p.targetOrgan = state.selectedOrgan ?? pickOrgan();
        }

        if (p.phase === "organ"){
          p.phaseT += dt * speed * 0.9;
          const orgPath = state.paths.organs[p.targetOrgan];
          moveAlongPath(p, orgPath, p.phaseT);

          // As it passes through capillaries, oxygen drops
          p.o2 = Math.max(0, p.o2 - dt * 0.7);

          if (p.phaseT >= 1){
            p.phase = "main";
          }
        } else {
          // main systemic track
          moveAlongPath(p, state.paths.systemic, p.s);
        }
      } else {
        // Pulmonary circuit: detour into lungs bed (brief), then oxygenate
        if (p.phase === "main" && Math.random() < dt * 0.55){
          p.phase = "lungs";
          p.phaseT = 0;
        }

        if (p.phase === "lungs"){
          p.phaseT += dt * speed * 1.0;
          moveAlongPath(p, state.paths.lungsBed, p.phaseT);
          p.o2 = Math.min(1, p.o2 + dt * 1.25);
          if (p.phaseT >= 1) p.phase = "main";
        } else {
          moveAlongPath(p, state.paths.pulmonary, p.s);
        }
      }

      p.el.setAttribute("fill", colorFor(p));
    }
  }

  function ensureStarted(){
    if (state.started) return;
    state.started = true;
    buildScene();
    rebuildParticles();
    updateUI();
    updateHighlight();
    state.t0 = performance.now();
    state.raf = requestAnimationFrame(tick);
  }

  function restart(){
    buildScene();
    rebuildParticles();
    updateUI();
    updateHighlight();
    state.t0 = performance.now();
  }

  function init(){
    // Start later when the circulation tab is opened.
    bpm.addEventListener("input", updateUI);
    resistance.addEventListener("input", updateUI);
    particlesSlider.addEventListener("input", () => { rebuildParticles(); updateUI(); });
    toggleO2.addEventListener("change", updateUI);
    toggleNames.addEventListener("change", updateUI);

    restartBtn.addEventListener("click", restart);
    pauseBtn.addEventListener("click", () => {
      state.paused = !state.paused;
      pauseBtn.textContent = state.paused ? "Resume" : "Pause";
    });
  }

  return { init, ensureStarted };
})();

// -----------------------------
// Boot
// -----------------------------
initTabs();
vessel.init();
assessment.init();
circ.init();
circ.ensureStarted();
