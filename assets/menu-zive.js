/* Živé denné menu a lístok z administrácie (len weby s profilom "admin": true, site/admin.py).
   Po načítaní stránky stiahne GET <api>/menu/<site> a prekreslí:
     domov   záložky dní obedového menu (dnešok vybraný)
     menu/   celý týždeň, dnešok zvýraznený
     lístok  nahraný jedálny lístok (fotka / PDF) nad stálym lístkom
     všade   otváracie hodiny z adminu do každého <dl data-hodiny> (+ zvýraznenie dneška ako restauracia.js)
   Keď API neodpovie, ostane statická verzia z buildu. Riadky jedál kreslí rovnako ako Python
   riadky_dna() danej šablóny (test parity: restauracia/site/test_admin.py). */
(function (koren) {
  "use strict";

  var ALERGENY = ["Obilniny obsahujúce lepok", "Kôrovce", "Vajcia", "Ryby", "Arašidy", "Sójové zrná",
    "Mlieko", "Orechy", "Zeler", "Horčica", "Sezamové semená", "Oxid siričitý a siričitany", "Vlčí bôb", "Mäkkýše"];
  var DNI = ["nedela", "pondelok", "utorok", "streda", "stvrtok", "piatok", "sobota"];

  function e(v) { // = html.escape(str(v), quote=True) v spolocne.e
    if (v === null || v === undefined || v === "") return "";
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  }
  function s(v) { return v === null || v === undefined ? "" : String(v); }
  function cisla(al, unikat) {
    var out = [];
    (s(al).match(/\d+/g) || []).forEach(function (c) {
      c = parseInt(c, 10);
      if (c >= 1 && c <= 14 && !(unikat && out.indexOf(c) > -1)) out.push(c);
    });
    return out;
  }
  function mnAl(x) { // spolocne.mnozstvo_alergeny
    var al = x.alergeny;
    return [e(x.mnozstvo), al ? "alergény " + e(al) : ""].filter(Boolean).join(", ");
  }

  /* ---------- riadky dňa podľa šablóny ---------- */
  var R = {};
  R.tradicia = function (d) {
    var AL = /^\s*((?:\d{1,2}\s*,\s*)*\d{1,2})\s*(?:,\s*|$)(.*)$/;
    function rozober(x) {
      var popis = s(x.popis).trim(), al = s(x.alergeny).trim();
      if (popis && !al) {
        var m = AL.exec(popis);
        if (m && (m[1].match(/\d+/g) || []).every(function (c) { return +c >= 1 && +c <= 14; })) { al = m[1]; popis = m[2].trim(); }
      }
      return [popis, al.replace(/\s*,\s*/g, ", ")];
    }
    function pol(x, cena, navyse) {
      var r = rozober(x), popis = navyse || r[0], al = r[1];
      var meta = [e(x.mnozstvo), al ? "alergény " + e(al) : ""].filter(Boolean).map(function (v) { return "<span>" + v + "</span>"; }).join("");
      return '<li class="pol"><div class="pol__r"><span class="pol__n">' + e(x.nazov) + '</span><span class="pol__b" aria-hidden="true"></span>' +
        '<span class="pol__p">' + (cena ? e(x.cena) : "") + "</span></div>" + (popis ? "<p class=pol__m>" + e(popis) + "</p>" : "") +
        (meta ? "<p class=pol__x>" + meta + "</p>" : "") + "</li>";
    }
    var h = (d.polievka || []).map(function (p) { return pol(p, false, "v cene menu"); }).join("") +
      (d.jedla || []).map(function (j) { return pol(j, true, ""); }).join("");
    return ('<ul class="kat__zoz">' + h + "</ul>").replace(/[—–]/g, "-"); // _bez_pomlciek
  };
  R.bistro = function (d) {
    function al(x) {
      var a = s(x.alergeny).trim();
      if (!a) return "";
      var c = cisla(a, true);
      if (!c.length) return '<span class="pol__al">alergény ' + e(a) + "</span>";
      return '<span class="pol__al">alergény ' + c.map(function (n) { return '<abbr title="' + e(ALERGENY[n - 1]) + '">' + n + "</abbr>"; }).join("") + "</span>";
    }
    function det(x) { return (x.mnozstvo ? '<span class="pol__mn">' + e(x.mnozstvo) + "</span>" : "") + al(x); }
    var h = (d.polievka || []).map(function (p) {
      return '<li class="pol pol--polievka"><span class="pol__n">' + e(p.nazov) + '</span><span class="pol__c pol__c--v">v cene</span>' +
        '<span class="pol__m"><span class="pol__d">' + det(p) + "</span></span></li>";
    }).join("") + (d.jedla || []).map(function (j, i) {
      return '<li class="pol"><span class="pol__n"><b class="pol__cislo">' + (i + 1) + "</b>" + e(j.nazov) + '</span><span class="pol__c">' + e(j.cena) + "</span>" +
        '<span class="pol__m"><span class="pol__d">' + det(j) + "</span></span></li>";
    }).join("");
    return '<ul class="polozky polozky--den">' + h + "</ul>";
  };
  R.kaviaren = function (d) {
    function al(a) {
      if (!a) return "";
      var c = cisla(a, false);
      if (!c.length) return "alergény " + e(a);
      return 'alergény <abbr title="' + e(c.map(function (n) { return ALERGENY[n - 1]; }).join(", ")) + '">' + c.join(", ") + "</abbr>";
    }
    var pol = (d.polievka || []).map(function (x) {
      return { nazov: x.nazov, popis: "Polievka v cene menu", mnozstvo: x.mnozstvo, alergeny: x.alergeny, cena: "" };
    }).concat(d.jedla || []);
    return '<ul class="k-polozky">' + pol.map(function (x) {
      var meta = [e(x.mnozstvo), al(x.alergeny)].filter(Boolean);
      return '<li class="k-pol"><div class="k-pol__r"><span class="k-pol__n">' + e(x.nazov) + '</span><span class="k-pol__c">' + e(x.cena) + "</span></div>" +
        (x.popis ? '<p class="k-pol__popis">' + e(x.popis) + "</p>" : "") + (meta.length ? "<p class=k-pol__m>" + meta.join(" · ") + "</p>" : "") + "</li>";
    }).join("") + "</ul>";
  };
  R.trattoria = function (d) {
    var h = (d.polievka || []).map(function (p) {
      return '<li class="pol"><span class="n">' + e(p.nazov) + '</span><span class="p">v cene</span><span class="m">Polievka, ' + mnAl(p) + "</span></li>";
    }).join("") + (d.jedla || []).map(function (j) {
      return '<li><span class="n">' + e(j.nazov) + '</span><span class="p">' + e(j.cena) + '</span><span class="m">' + mnAl(j) + "</span></li>";
    }).join("");
    return '<ul class="tr-pol">' + h + "</ul>";
  };
  var DNES_TRIEDA = { tradicia: "den--dnes", bistro: "den--dnes", kaviaren: "k-den--dnes", trattoria: "je-dnes" };
  var LISTOK_OBSAH = {
    tradicia: [".obal.listok"],
    bistro: ['section.blok[aria-label="Celý jedálny lístok"]'],
    kaviaren: [".k-kat-nav", ".k-listok"],
    trattoria: [".tr-kn", ".tr-lk"]
  };

  /* ---------- pomocné ---------- */
  function bezDiakritiky(t) { return s(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function dnesIso() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function indexDnes(dni) {
    var iso = dnesIso();
    for (var i = 0; i < dni.length; i++) if (dni[i].datum === iso) return i;
    if (dni.some(function (d) { return d.datum; })) return -1; // má dátumy, dnešok medzi nimi nie je
    var meno = DNI[new Date().getDay()];
    for (i = 0; i < dni.length; i++) if (bezDiakritiky(dni[i].den).indexOf(meno) === 0) return i;
    return -1;
  }
  function nahradText(koren, stare, nove) { // „Týždeň 5. - 9. 10.“ v texte stránky -> nový týždeň
    stare = s(stare).replace(/[—–]/g, "-").trim();
    if (!stare || !koren || nove === undefined || nove === null || stare === s(nove)) return;
    var w = document.createTreeWalker(koren, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var t = n.nodeValue.replace(/[—–]/g, "-");
      if (t.indexOf(stare) > -1) n.nodeValue = t.split(stare).join(s(nove).replace(/[—–]/g, "-"));
    }
  }
  function skry(el) { if (el) el.style.setProperty("display", "none", "important"); } // [hidden] šablóny prebíjajú vlastným display
  function prvyText(el, text) { // nadpis dňa (tradícia má v ňom aj <span>dnes</span>)
    if (!el) return;
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3) { el.childNodes[i].nodeValue = text; return; }
    el.insertBefore(document.createTextNode(text), el.firstChild);
  }
  function styl() {
    if (document.getElementById("mz-styl")) return;
    var st = document.createElement("style");
    st.id = "mz-styl";
    st.textContent =
      ".mz-subor{grid-column:1/-1;margin:0 0 20px;display:grid;gap:12px;justify-items:start}" +
      ".mz-subor img{display:block;width:100%;max-width:820px;height:auto;border-radius:10px;box-shadow:0 2px 18px rgba(0,0,0,.14);background:#fff}" +
      ".mz-subor--domov img{max-height:560px;width:auto;max-width:100%;object-fit:contain}" +
      ".mz-subor__tl{display:inline-flex;align-items:center;min-height:44px;padding:10px 20px;border-radius:999px;background:var(--mz-akcent,#1d1f22);color:#fff!important;text-decoration:none;font-weight:700}" +
      ".mz-listok{max-width:1200px;margin:24px auto;padding:0 16px}" +
      ".mz-listok h2{margin:0 0 6px}" +
      ".mz-spat{position:fixed;left:16px;bottom:calc(var(--wh-lista,0px) + 16px);z-index:9998;background:#1d1f22;color:#fff;border-radius:999px;padding:10px 16px;font:600 14px/1.2 system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 18px rgba(0,0,0,.25)}";
    document.head.appendChild(st);
  }
  function suborHtml(sub, nadpis, trieda) {
    var url = sub && sub.url;
    if (!url || !/^https:\/\//.test(url)) return null;
    var div = document.createElement("div");
    div.className = "mz-subor" + (trieda ? " " + trieda : "");
    var pdf = sub.typ === "application/pdf" || /\.pdf$/i.test(url);
    div.innerHTML = (pdf ? "" : '<a href="' + e(url) + '" target="_blank" rel="noopener"><img src="' + e(url) + '" alt="' + e(nadpis) + '" loading="lazy"></a>') +
      '<a class="mz-subor__tl" href="' + e(url) + '" target="_blank" rel="noopener">' + (pdf ? "Otvoriť " + e(nadpis.toLowerCase()) + " (PDF)" : "Zobraziť vo veľkom") + "</a>";
    return div;
  }

  /* ---------- denné menu ---------- */
  function vymenUl(box, html) {
    var ul = box && box.querySelector("ul");
    if (!ul) return;
    var t = document.createElement("div");
    t.innerHTML = html;
    ul.parentNode.replaceChild(t.firstChild, ul);
  }
  function skryTlacMenu() { // statické menu na tlač je z buildu, s živým menu by nesedelo
    [].forEach.call(document.querySelectorAll('a[href$="menu-a4.pdf"], a[href*="nahlad/denne-menu"]'), function (a) {
      if (!a.closest("#wh-navrh")) skry(a);
    });
  }
  function domov(menu, cfg, render) {
    var zoz = document.querySelector('[role=tablist][aria-label="Dni v týždni"]');
    if (!zoz) return;
    var sekcia = zoz.closest("section") || zoz.parentNode;
    var tabs = [].slice.call(zoz.querySelectorAll("[role=tab]"));
    var panely = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
    if (!tabs.length || panely.some(function (p) { return !p; })) return;
    nahradText(sekcia, cfg.tyzden, menu.tyzden);
    nahradText(sekcia, cfg.cas, menu.cas);
    if (menu.rezim === "subor") {
      var b = suborHtml(menu.subor, "Denné menu", "mz-subor--domov");
      if (!b) return;
      skry(zoz);
      panely.forEach(skry);
      panely[0].parentNode.insertBefore(b, panely[0]);
      return;
    }
    var dni = (menu.dni || []).filter(function (d) { return d && d.den; });
    if (!dni.length) return;
    while (tabs.length < dni.length) { // viac dní ako v builde: klon posledného
      var t = tabs[tabs.length - 1].cloneNode(true), p = panely[panely.length - 1].cloneNode(true), n = tabs.length;
      t.id = (t.id || "mzt") + "-mz" + n; p.id = (p.id || "mzp") + "-mz" + n;
      t.setAttribute("aria-controls", p.id); p.setAttribute("aria-labelledby", t.id);
      tabs[tabs.length - 1].after(t); panely[panely.length - 1].after(p);
      tabs.push(t); panely.push(p);
    }
    while (tabs.length > dni.length) { tabs.pop().remove(); panely.pop().remove(); }
    // vlastné prepínanie (klon tlačidla zahodí poslucháčov šablóny)
    tabs = tabs.map(function (t) { var c = t.cloneNode(true); t.parentNode.replaceChild(c, t); return c; });
    function ukaz(k) {
      tabs.forEach(function (t, j) { t.setAttribute("aria-selected", j === k); t.tabIndex = j === k ? 0 : -1; panely[j].hidden = j !== k; });
    }
    tabs.forEach(function (t, j) {
      t.textContent = dni[j].den;
      vymenUl(panely[j], render(dni[j]));
      prvyText(panely[j].querySelector("h2, h3"), dni[j].den);
      t.addEventListener("click", function () { ukaz(j); });
      t.addEventListener("keydown", function (ev) {
        var n = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (n) { var k = (j + n + tabs.length) % tabs.length; ukaz(k); tabs[k].focus(); }
      });
    });
    ukaz(Math.max(0, indexDnes(dni)));
  }
  function tyzden(menu, cfg, render, sablona) {
    var dniEl = [].slice.call(document.querySelectorAll("[data-den]"));
    if (!dniEl.length) return;
    var main = document.querySelector("main") || document.body;
    nahradText(main, cfg.tyzden, menu.tyzden);
    nahradText(main, cfg.cas, menu.cas);
    var nav = [].slice.call(document.querySelectorAll('nav[aria-label="Dni v týždni"] a[href^="#d"]'));
    if (menu.rezim === "subor") {
      var b = suborHtml(menu.subor, "Denné menu", "");
      if (!b) return;
      dniEl[0].parentNode.insertBefore(b, dniEl[0]);
      dniEl.forEach(skry);
      nav.forEach(skry);
      return;
    }
    var dni = (menu.dni || []).filter(function (d) { return d && d.den; });
    if (!dni.length) return;
    while (dniEl.length < dni.length) {
      var c = dniEl[dniEl.length - 1].cloneNode(true);
      c.removeAttribute("id");
      [].forEach.call(c.querySelectorAll("[id]"), function (x) { x.removeAttribute("id"); });
      c.removeAttribute("aria-labelledby");
      dniEl[dniEl.length - 1].after(c); dniEl.push(c);
      if (nav.length) { var a = nav[nav.length - 1].cloneNode(true); nav[nav.length - 1].after(a); nav.push(a); }
    }
    while (dniEl.length > dni.length) dniEl.pop().remove();
    while (nav.length > dni.length) nav.pop().remove();
    var dnes = indexDnes(dni), tr = DNES_TRIEDA[sablona];
    dniEl.forEach(function (el, i) {
      el.setAttribute("data-den", i);
      if (!el.id && sablona === "tradicia") el.id = "d" + (i + 1);
      prvyText(el.querySelector("h2, h3"), dni[i].den);
      vymenUl(el, render(dni[i]));
      el.classList.toggle(tr, i === dnes);
      if (nav[i]) { nav[i].textContent = dni[i].den; nav[i].setAttribute("href", "#" + (el.id || "")); }
    });
  }

  /* ---------- jedálny lístok ---------- */
  function listok(l, sablona) {
    var sub = l && l.subor;
    var b = suborHtml(sub, "Jedálny lístok", "");
    if (!b) return;
    var obsah = [];
    (LISTOK_OBSAH[sablona] || []).forEach(function (sel) { [].push.apply(obsah, document.querySelectorAll(sel)); });
    var obal = document.createElement("section");
    obal.className = "mz-listok";
    obal.setAttribute("aria-label", "Aktuálny jedálny lístok");
    obal.innerHTML = "<h2>Aktuálny jedálny lístok</h2>";
    obal.appendChild(b);
    if (obsah.length) obsah[0].parentNode.insertBefore(obal, obsah[0]);
    else (document.querySelector("main") || document.body).appendChild(obal);
    if (l.skryt_povodny !== false) obsah.forEach(skry);
  }

  /* ---------- otváracie hodiny ---------- */
  var DNI_HOD = ["nedeľa", "pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota"];
  function jeDnes(t, dnes) { // = restauracia.js „dnešný deň v hodinách“
    t = t.toLowerCase().replace(/\s+/g, " ");
    var ix = DNI_HOD.map(function (d, i) { return t.indexOf(d.slice(0, 3)) > -1 ? i : -1; }).filter(function (i) { return i > -1; });
    if (/denne|každý deň|po ?- ?ne/.test(t)) return true;
    if (ix.length === 1) return ix[0] === dnes;
    if (ix.length >= 2 && /-|až/.test(t)) {
      var a = t.indexOf(DNI_HOD[ix[0]].slice(0, 3)) < t.indexOf(DNI_HOD[ix[1]].slice(0, 3)) ? ix[0] : ix[1];
      var b = a === ix[0] ? ix[1] : ix[0];
      var aa = a === 0 ? 7 : a, bb = b === 0 ? 7 : b, dd = dnes === 0 ? 7 : dnes;
      return aa <= bb ? dd >= aa && dd <= bb : dd >= aa || dd <= bb;
    }
    return ix.indexOf(dnes) > -1;
  }
  function hodiny(h) {
    var riadky = (h || []).filter(function (r) { return r && (s(r[0]) || s(r[1])); });
    if (!riadky.length) return;
    var dnes = new Date().getDay();
    [].forEach.call(document.querySelectorAll("dl[data-hodiny]"), function (dl) {
      dl.innerHTML = riadky.map(function (r) {
        var a = s(r[0]).replace(/[—–]/g, "-"), b = s(r[1]).replace(/[—–]/g, "-"), c = jeDnes(a, dnes) ? ' class="dnes"' : "";
        return "<dt" + c + ">" + e(a) + "</dt><dd" + c + ">" + e(b) + "</dd>";
      }).join("");
    });
  }

  /* ---------- štart ---------- */
  function spusti(cfg) {
    var render = R[cfg.sablona] || R.bistro;
    styl();
    if (cfg.akcent) document.documentElement.style.setProperty("--mz-akcent", cfg.akcent);
    if (/[?&]z=admin\b/.test(location.search)) {
      var a = document.createElement("a");
      a.className = "mz-spat"; a.href = cfg.koren + "admin/"; a.textContent = "‹ Späť do administrácie";
      document.body.appendChild(a);
    }
    var ctrl = window.AbortController ? new AbortController() : null;
    var casovac = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    fetch(cfg.api + "/menu/" + encodeURIComponent(cfg.site), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function () { return null; })
      .then(function (doc) {
        clearTimeout(casovac);
        // kópia, ktorú práve uložil admin v tomto prehliadači (KV sa k ostatným rozšíri do minúty)
        try {
          var lok = JSON.parse(localStorage.getItem("menu-zive:" + cfg.site) || "null");
          if (lok && lok.doc && Date.now() - lok.cas < 10 * 60000 && (!doc || s(lok.doc.upravene) > s(doc.upravene))) doc = lok.doc;
        } catch (ex) {}
        if (!doc) return; // API nedostupné: ostáva statická verzia
        document.documentElement.setAttribute("data-menu-zive", doc.upravene || "");
        if (doc.menu && (cfg.strana === "domov" || cfg.strana === "menu")) {
          skryTlacMenu();
          if (cfg.strana === "domov") domov(doc.menu, cfg, render);
          else tyzden(doc.menu, cfg, render, cfg.sablona);
        }
        if (doc.listok && cfg.strana === "listok") listok(doc.listok, cfg.sablona);
        if (doc.hodiny && doc.hodiny.length) hodiny(doc.hodiny);
      });
  }

  var api = { render: R, spusti: spusti, indexDnes: indexDnes };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; } // node: test parity
  koren.MenuZive = api;
  var sk = document.currentScript;
  if (sk && sk.getAttribute("data-site")) {
    var cfg = { api: sk.getAttribute("data-api"), site: sk.getAttribute("data-site"), sablona: sk.getAttribute("data-sablona"),
      strana: sk.getAttribute("data-strana"), tyzden: sk.getAttribute("data-tyzden") || "", cas: sk.getAttribute("data-cas") || "",
      koren: sk.getAttribute("data-koren") || "", akcent: sk.getAttribute("data-akcent") || "" };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { spusti(cfg); });
    else spusti(cfg);
  }
})(this);
