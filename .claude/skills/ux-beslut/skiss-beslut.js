// Vote boxes under each <section class="finding" id="ux-NN"> on a sketch page (Före/Efter).
// Idempotent: removes old boxes first, so "Save as" + reopen gives no duplicates.
// Edit Q (open questions). Publish the page with capabilities {"db":{}}; read picks/decisions with ArtifactData.
(function () {
  var Q = {
    d1: { label: "Beslut 1 · UX-02: Kopiera till ICA och Dela listan", opts: [["slut", "Sist i listan (som skissen)"], ["meny", "⋯-meny i rubriken"]] },
    d2: { label: "Beslut 2 · UX-05: Lägg på matsedeln", opts: [["ark", "Alltid arket Vilken vecka? (två tryck)"], ["ett", "Ett tryck, Byt vecka i bekräftelsen"]] },
    d3: { label: "Beslut 3 · UX-13b: bild på rätten", opts: [["b-sen-a", "B nu, prova A på 5 recept"], ["a", "A direkt"], ["b", "Bara B"]] },
    d4: { label: "Beslut 4 · UX-28: knappen i sökfältet", opts: [["fraga", "Fråga"], ["skicka", "Skicka"]] }
  };
  var state = {}; var db = null; var status = null;
  function load() { try { return JSON.parse(localStorage.getItem("ux-mock") || "{}"); } catch (e) { return {}; } }
  function keep() { try { localStorage.setItem("ux-mock", JSON.stringify(state)); } catch (e) {} }
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function save(col, id, patch) {
    var key = col + "/" + id; state[key] = Object.assign({}, state[key] || {}, patch, { at: new Date().toISOString() });
    paint();
    if (db) db.doc(key).set(state[key]).then(function () { say("Sparat."); }).catch(function (e) { say("Kunde inte spara (" + e.code + "). Försök igen."); });
    else keep();
  }
  function say(t) { if (status) status.textContent = t; }
  var boxes = [];
  function box(col, id, head, opts) {
    var v = el("div", "vote"); v.appendChild(el("div", "vh", head));
    var row = el("div", "opts2"); row.setAttribute("role", "group"); row.setAttribute("aria-label", head);
    opts.forEach(function (o) {
      var b = el("button", null, o[1]); b.type = "button"; b.dataset.v = o[0];
      b.addEventListener("click", function () { var cur = (state[col + "/" + id] || {}).choice; save(col, id, { choice: cur === o[0] ? null : o[0] }); });
      row.appendChild(b);
    });
    v.appendChild(row);
    var ta = el("textarea"); ta.id = "n-" + col + "-" + id; ta.placeholder = "Kommentar (valfri)"; ta.setAttribute("aria-label", "Kommentar: " + head);
    ta.addEventListener("change", function () { save(col, id, { note: ta.value.trim() }); });
    v.appendChild(ta);
    boxes.push({ col: col, id: id, row: row, ta: ta });
    return v;
  }
  function paint() {
    boxes.forEach(function (b) {
      var s = state[b.col + "/" + b.id] || {};
      b.row.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(s.choice === x.dataset.v)); });
      if (document.activeElement !== b.ta) b.ta.value = s.note || "";
    });
  }
  document.querySelectorAll(".vote,.dstatus").forEach(function (n) { n.remove(); });
  document.querySelectorAll("section.finding").forEach(function (sec) {
    var id = sec.id.toUpperCase();
    sec.appendChild(box("picks", id, "Ditt beslut om " + id, [["ok", "Godkänn"], ["andra", "Godkänn med ändring"], ["nej", "Bygg inte"]]));
  });
  var dec = document.querySelector(".decide");
  if (dec) {
    Object.keys(Q).forEach(function (k) { dec.appendChild(box("decisions", k, Q[k].label, Q[k].opts)); });
    status = el("p", "dstatus", "Ansluter …"); status.setAttribute("aria-live", "polite"); dec.appendChild(status);
  }
  state = load(); paint();
  if (window.claude && window.claude.use) {
    window.claude.use("db").then(function (d) {
      if (!d) { say("Valen sparas bara i den här webbläsaren. Berätta för mig vad du valt."); return; }
      db = d; say("Dina val sparas och jag kan läsa dem.");
      ["picks", "decisions"].forEach(function (col) {
        db.collection(col).onSnapshot(function (snap) {
          snap.docs.forEach(function (doc) { if (doc.exists) state[col + "/" + doc.id] = doc.data(); });
          paint();
        }, function () { say("Tappade kontakten med lagringen. Ladda om sidan."); });
      });
    });
  } else say("Valen sparas bara i den här webbläsaren. Berätta för mig vad du valt.");
})();
