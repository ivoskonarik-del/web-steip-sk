/* Administrácia denného menu, jedálneho lístka a otváracích hodín (site/admin.py). Bez knižníc, mobile first.
   Prihlásenie heslom -> krátkodobý token z API (nie heslo) v localStorage/sessionStorage.
   Dáta: GET/POST <api>/menu/<site>, súbory POST <api>/soubor/<site> (fotky sa pred nahraním zmenšia). */
(function () {
  "use strict";
  var B = document.body, API = B.getAttribute("data-api"), SITE = B.getAttribute("data-site");
  var KT = "mz-token:" + SITE, KTAB = "mz-tab:" + SITE;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var kopia = function (o) { return JSON.parse(JSON.stringify(o)); };
  var POVODNE = JSON.parse($("#mz-povodne").textContent);
  var DNI = ["Nedeľa", "Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota"];
  var MAX_PDF = 10 * 1024 * 1024;

  var token = null, stav = null, ulozene = null, zmeny = { menu: false, listok: false, hodiny: false }, tab = "menu";
  var BEZ_MENU = B.getAttribute("data-bez-menu") === "1"; // profil "admin_menu": false
  var TABY = BEZ_MENU ? ["listok", "hodiny"] : ["menu", "listok", "hodiny"];
  if (BEZ_MENU) tab = "listok";
  function neulozene() { return zmeny.menu || zmeny.listok || zmeny.hodiny; }

  /* ---------- token ---------- */
  function citajToken() {
    try { return localStorage.getItem(KT) || sessionStorage.getItem(KT); } catch (ex) { return null; }
  }
  function ulozToken(t, trvalo) {
    try { localStorage.removeItem(KT); sessionStorage.removeItem(KT); (trvalo ? localStorage : sessionStorage).setItem(KT, t); } catch (ex) {}
    token = t;
  }
  function zmazToken() { try { localStorage.removeItem(KT); sessionStorage.removeItem(KT); } catch (ex) {} token = null; }

  /* ---------- API ---------- */
  function api(metoda, cesta, telo, hlavicky) {
    var h = hlavicky || {};
    if (token) h.Authorization = "Bearer " + token;
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    return fetch(API + cesta, { method: metoda, headers: h, body: telo, cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        clearTimeout(t);
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var ch = new Error(d.chyba || "Chyba servera (" + r.status + ")"); ch.status = r.status; throw ch; }
          return d;
        });
      }, function () {
        clearTimeout(t);
        var ch = new Error("Server neodpovedá. Skontrolujte pripojenie na internet a skúste to znova.");
        ch.status = 0; throw ch;
      });
  }

  /* ---------- dátumy ---------- */
  function iso(d) { var p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function zIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function posun(s, n) { var d = zIso(s); if (!d) return s; d.setDate(d.getDate() + n); return iso(d); }
  function pondelok(d) { d = new Date(d); var w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return d; }
  function bez(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function tyzdenText(dni) {
    var d = dni.map(function (x) { return zIso(x.datum); }).filter(Boolean);
    if (!d.length) return "";
    var a = d[0], b = d[d.length - 1];
    if (a.getMonth() === b.getMonth()) return a.getDate() + ". až " + b.getDate() + ". " + (b.getMonth() + 1) + ". " + b.getFullYear();
    return a.getDate() + ". " + (a.getMonth() + 1) + ". až " + b.getDate() + ". " + (b.getMonth() + 1) + ". " + b.getFullYear();
  }
  function kratkyDatum(s) { var d = zIso(s); return d ? d.getDate() + ". " + (d.getMonth() + 1) + "." : ""; }
  function kedy(s) {
    var d = new Date(s); if (isNaN(d)) return "";
    var dnes = new Date(), den = d.toDateString() === dnes.toDateString() ? "dnes" : d.toLocaleDateString("sk-SK");
    return den + " o " + d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  }

  /* ---------- východiskové menu z buildu (keď ešte nič uložené nie je) ---------- */
  function zPovodneho() {
    var po = pondelok(new Date());
    var dni = (POVODNE.dni && POVODNE.dni.length ? POVODNE.dni : ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok"].map(function (d) {
      return { den: d, polievka: [], jedla: [] };
    })).map(function (d, i) {
      var ix = DNI.map(bez).indexOf(bez(d.den));
      var dat = new Date(po); dat.setDate(po.getDate() + (ix > 0 ? ix - 1 : ix === 0 ? 6 : i));
      return { den: d.den, datum: iso(dat), polievka: kopia(d.polievka || []), jedla: kopia(d.jedla || []) };
    });
    return { rezim: "rozpis", cas: POVODNE.cas || "", tyzden: tyzdenText(dni), dni: dni, subor: null };
  }

  /* ---------- prihlásenie ---------- */
  var login = $("#login"), app = $("#app");
  function ukazLogin(sprava) {
    app.hidden = true; login.hidden = false;
    var ch = $("#login-chyba"); ch.hidden = !sprava; ch.textContent = sprava || "";
    setTimeout(function () { $("#heslo").focus(); }, 30);
  }
  var poPrihlaseni = null;
  $("#login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var h = $("#heslo").value, tl = $("#login-tl");
    if (!h) { ukazLogin("Zadajte heslo."); return; }
    tl.disabled = true; tl.textContent = "Prihlasujem…";
    token = null;
    api("POST", "/login/" + SITE, JSON.stringify({ heslo: h, zapamatat: $("#zapamatat").checked }), { "Content-Type": "application/json" })
      .then(function (d) {
        ulozToken(d.token, $("#zapamatat").checked);
        $("#heslo").value = "";
        login.hidden = true;
        if (poPrihlaseni) { var f = poPrihlaseni; poPrihlaseni = null; app.hidden = false; f(); }
        else nacitaj();
      }, function (ch) {
        ukazLogin(ch.status === 401 ? "Nesprávne heslo. Skúste to znova." : ch.message);
        $("#heslo").select();
      })
      .then(function () { tl.disabled = false; tl.textContent = "Prihlásiť sa"; });
  });
  $("#odhlasit").addEventListener("click", function () {
    var von = function () { zmazToken(); zmeny.menu = zmeny.listok = zmeny.hodiny = false; location.reload(); };
    if (neulozene()) potvrd("Máte neuložené zmeny", "Ak sa teraz odhlásite, neuložené zmeny sa stratia.", "Odhlásiť", von);
    else von();
  });

  /* ---------- načítanie ---------- */
  function nacitaj() {
    app.hidden = false;
    $("#panel-" + tab).innerHTML = '<p class="mz-tichy">Načítavam…</p>';
    var ch = $("#nacitanie-chyba"); ch.hidden = true;
    api("GET", "/menu/" + SITE).then(function (d) {
      ulozene = d;
      stav = { menu: d.menu ? kopia(d.menu) : zPovodneho(), listok: d.listok ? kopia(d.listok) : { subor: null, skryt_povodny: true },
        hodiny: d.hodiny && d.hodiny.length ? kopia(d.hodiny) : kopia(POVODNE.hodiny || []) };
      stav.menu.dni = stav.menu.dni || [];
      zmeny.menu = zmeny.listok = zmeny.hodiny = false;
      var t0 = BEZ_MENU ? "listok" : null;
      try { var t = sessionStorage.getItem(KTAB); if (t === "listok" || t === "hodiny") t0 = t; } catch (ex) {}
      if (t0) prepni(t0, true);
      kresli(); aktualizujStav();
    }, function (e) {
      $("#panel-menu").innerHTML = "";
      ch.hidden = false;
      ch.innerHTML = esc(e.message) + ' <button class="mz-tl mz-tl--maly" type="button" id="znova">Skúsiť znova</button>';
      $("#znova").onclick = nacitaj;
    });
  }

  /* ---------- záložky ---------- */
  var tabs = { menu: $("#tab-menu"), listok: $("#tab-listok"), hodiny: $("#tab-hodiny") };
  function prepni(t, ticho) {
    tab = t;
    ["menu", "listok", "hodiny"].forEach(function (x) {
      tabs[x].setAttribute("aria-selected", x === t); tabs[x].tabIndex = x === t ? 0 : -1; $("#panel-" + x).hidden = x !== t;
    });
    try { sessionStorage.setItem(KTAB, t); } catch (ex) {}
    if (!ticho) window.scrollTo(0, 0);
  }
  tabs.menu.onclick = function () { prepni("menu"); };
  tabs.listok.onclick = function () { prepni("listok"); };
  tabs.hodiny.onclick = function () { prepni("hodiny"); };
  $(".mz-taby").addEventListener("keydown", function (ev) {
    var k = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
    if (k) { var n = TABY[(TABY.indexOf(tab) + k + TABY.length) % TABY.length]; prepni(n); tabs[n].focus(); }
  });

  /* ---------- väzba polí: data-cesta="menu.dni.0.jedla.1.cena" ---------- */
  function ziskaj(c) { return c.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, stav); }
  function nastav(c, v) {
    var p = c.split("."), o = stav;
    for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = {}; o = o[p[i]]; }
    o[p[p.length - 1]] = v;
  }
  function pole(c, popis, o) {
    o = o || {};
    var v = ziskaj(c); v = v == null ? "" : v;
    return '<label class="mz-pole' + (o.cls ? " " + o.cls : "") + '"><span>' + popis + "</span>" +
      '<input type="' + (o.typ || "text") + '" data-cesta="' + c + '" value="' + esc(v) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") +
      (o.mode ? ' inputmode="' + o.mode + '"' : "") + (o.ac === false ? ' autocomplete="off"' : "") + ' enterkeyhint="next"></label>';
  }
  document.addEventListener("input", function (ev) {
    var c = ev.target.getAttribute && ev.target.getAttribute("data-cesta");
    if (!c) return;
    nastav(c, ev.target.value);
    zmeny[c.split(".")[0]] = true;
    if (/^menu\.dni\.\d+\.datum$/.test(c)) {
      var i = +c.split(".")[2], d = zIso(ev.target.value);
      if (d) {
        stav.menu.dni[i].den = DNI[d.getDay()];
        var h = $('[data-den-nazov="' + i + '"]'); if (h) h.textContent = DNI[d.getDay()] + " " + kratkyDatum(ev.target.value);
        stav.menu.tyzden = tyzdenText(stav.menu.dni);
        var t = $("#tyzden-text"); if (t) t.textContent = stav.menu.tyzden;
      }
    }
    aktualizujStav();
  });

  /* ---------- denné menu ---------- */
  var otvorene = null;
  function kresliMenu() {
    var m = stav.menu, p = $("#panel-menu");
    if (otvorene === null) { // dnešok (alebo prvý deň) otvorený
      var dn = iso(new Date()); otvorene = {};
      var ix = m.dni.map(function (d) { return d.datum; }).indexOf(dn); otvorene[ix > -1 ? ix : 0] = true;
    }
    var h = '<div class="mz-uvod"><h1>Denné menu</h1><p class="mz-tichy">Napíšte menu po dňoch, alebo len odfoťte denný lístok a nahrajte fotku či PDF.</p></div>' +
      '<div class="mz-prepinac" role="radiogroup" aria-label="Ako zadať menu">' +
      '<label><input type="radio" name="rezim" value="rozpis"' + (m.rezim !== "subor" ? " checked" : "") + "><span>Napísať po dňoch</span></label>" +
      '<label><input type="radio" name="rezim" value="subor"' + (m.rezim === "subor" ? " checked" : "") + "><span>Fotka alebo PDF</span></label></div>";
    if (m.rezim === "subor") {
      h += '<div class="mz-karta">' + suborBlok(m.subor, "menu", "Odfotiť alebo nahrať denné menu") +
        '<div class="mz-mriezka">' + pole("menu.tyzden", "Na aký týždeň (zobrazí sa na webe)", { ph: "12. až 16. 10. 2026" }) +
        pole("menu.cas", "Čas podávania", { ph: "11:00 až 14:00" }) + "</div></div>";
    } else {
      h += '<div class="mz-karta mz-tyzden"><div><span class="mz-tichy">Týždeň</span><b id="tyzden-text">' + esc(m.tyzden || tyzdenText(m.dni) || "bez dátumu") + "</b></div>" +
        '<button class="mz-tl mz-tl--maly" type="button" id="dalsi-tyzden">Pripraviť ďalší týždeň</button>' +
        pole("menu.cas", "Čas podávania", { ph: "11:00 až 14:00", cls: "mz-pole--cele" }) + "</div>";
      h += m.dni.map(function (d, i) {
        var c = "menu.dni." + i;
        var pocet = (d.polievka || []).length + (d.jedla || []).length;
        return '<details class="mz-karta mz-den" data-i="' + i + '"' + (otvorene[i] ? " open" : "") + "><summary>" +
          '<span class="mz-den__nazov" data-den-nazov="' + i + '">' + esc(d.den) + " " + kratkyDatum(d.datum) + "</span>" +
          '<span class="mz-den__pocet">' + (pocet ? pocet + (pocet === 1 ? " položka" : pocet < 5 ? " položky" : " položiek") : "prázdne") + "</span></summary>" +
          '<div class="mz-den__telo">' + pole(c + ".datum", "Dátum", { typ: "date", cls: "mz-pole--datum" }) +
          '<h3 class="mz-sk">Polievka</h3>' + (d.polievka || []).map(function (x, j) {
            var cp = c + ".polievka." + j;
            return '<div class="mz-riadok">' + pole(cp + ".nazov", "Polievka", { cls: "mz-pole--nazov", ph: "Napr. Hovädzí vývar s rezancami" }) +
              pole(cp + ".mnozstvo", "Množstvo", { ph: "0,33 l", cls: "mz-pole--male" }) + pole(cp + ".alergeny", "Alergény", { ph: "1,3,9", cls: "mz-pole--male", mode: "numeric", ac: false }) +
              '<button class="mz-x" type="button" data-akcia="zmaz" data-cesta-zoz="' + c + '.polievka" data-j="' + j + '" aria-label="Odstrániť polievku">×</button></div>';
          }).join("") +
          '<button class="mz-pridat" type="button" data-akcia="pridaj-pol" data-i="' + i + '">+ Pridať polievku</button>' +
          '<h3 class="mz-sk">Jedlá</h3>' + (d.jedla || []).map(function (x, j) {
            var cj = c + ".jedla." + j;
            return '<div class="mz-riadok">' + pole(cj + ".nazov", "Jedlo " + (j + 1), { cls: "mz-pole--nazov", ph: "Napr. Bravčový rezeň, zemiaková kaša" }) +
              pole(cj + ".mnozstvo", "Gramáž", { ph: "150 g", cls: "mz-pole--male" }) + pole(cj + ".cena", "Cena", { ph: "7,50 €", cls: "mz-pole--male", mode: "decimal", ac: false }) +
              pole(cj + ".alergeny", "Alergény", { ph: "1,3,7", cls: "mz-pole--male", mode: "numeric", ac: false }) +
              '<button class="mz-x" type="button" data-akcia="zmaz" data-cesta-zoz="' + c + '.jedla" data-j="' + j + '" aria-label="Odstrániť jedlo ' + (j + 1) + '">×</button></div>';
          }).join("") +
          '<button class="mz-pridat" type="button" data-akcia="pridaj-jedlo" data-i="' + i + '">+ Pridať jedlo</button>' +
          (i > 0 ? '<button class="mz-tl mz-tl--maly mz-tl--tichy" type="button" data-akcia="kopiruj" data-i="' + i + '">Skopírovať jedlá z predošlého dňa</button>' : "") +
          "</div></details>";
      }).join("");
      h += '<p class="mz-tichy mz-pozn">Alergény píšte číslami 1 až 14 oddelenými čiarkou. Prázdne polia sa na webe nezobrazia.</p>';
    }
    p.innerHTML = h;
    [].forEach.call(p.querySelectorAll("details.mz-den"), function (d) {
      d.addEventListener("toggle", function () { otvorene[d.getAttribute("data-i")] = d.open; });
    });
    [].forEach.call(p.querySelectorAll('input[name="rezim"]'), function (r) {
      r.addEventListener("change", function () { stav.menu.rezim = r.value; zmeny.menu = true; kresliMenu(); aktualizujStav(); });
    });
    var dt = $("#dalsi-tyzden");
    if (dt) dt.onclick = function () {
      potvrd("Pripraviť ďalší týždeň?", "Dátumy sa posunú o 7 dní a názvy jedál sa vymažú, aby ste mohli napísať nové menu. Gramáže a ceny ostanú.", "Pripraviť týždeň", dalsiTyzden);
    };
    viazSubor(p, "menu");
  }
  function dalsiTyzden() {
    var m = stav.menu;
    if (!m.dni.length || !m.dni[0].datum) m.dni = zPovodneho().dni;
    m.dni.forEach(function (d) {
      d.datum = posun(d.datum, 7);
      (d.polievka || []).forEach(function (x) { x.nazov = ""; x.alergeny = ""; });
      (d.jedla || []).forEach(function (x) { x.nazov = ""; x.alergeny = ""; });
    });
    m.tyzden = tyzdenText(m.dni);
    m.rezim = "rozpis";
    otvorene = { 0: true };
    zmeny.menu = true; kresliMenu(); aktualizujStav();
    var prve = $('#panel-menu [data-cesta$=".nazov"]'); if (prve) prve.focus();
    toast("Týždeň " + m.tyzden + " je pripravený. Napíšte jedlá a uložte.");
  }

  /* ---------- akcie v zoznamoch ---------- */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-akcia]"); if (!b) return;
    var a = b.getAttribute("data-akcia"), i = +b.getAttribute("data-i");
    if (/^hod-/.test(a)) { akciaHodiny(a, i); return; }
    var d = stav && stav.menu.dni[i];
    if (a === "pridaj-pol") { (d.polievka = d.polievka || []).push({ nazov: "", mnozstvo: "0,33 l", alergeny: "" }); fokus(i, "polievka", d.polievka.length - 1); }
    else if (a === "pridaj-jedlo") {
      d.jedla = d.jedla || [];
      var pred = d.jedla[d.jedla.length - 1] || {};
      d.jedla.push({ nazov: "", mnozstvo: pred.mnozstvo || "", cena: pred.cena || "", alergeny: "" });
      fokus(i, "jedla", d.jedla.length - 1);
    } else if (a === "zmaz") {
      ziskaj(b.getAttribute("data-cesta-zoz")).splice(+b.getAttribute("data-j"), 1);
      zmeny.menu = true; kresliMenu();
    } else if (a === "kopiruj") {
      var pr = stav.menu.dni[i - 1];
      d.polievka = kopia(pr.polievka || []); d.jedla = kopia(pr.jedla || []);
      zmeny.menu = true; kresliMenu(); toast("Jedlá z predošlého dňa sú skopírované, upravte čo treba.");
    } else return;
    aktualizujStav();
  });
  function fokus(i, zoz, j) {
    zmeny.menu = true; otvorene[i] = true; kresliMenu();
    var el = $('[data-cesta="menu.dni.' + i + "." + zoz + "." + j + '.nazov"]'); if (el) el.focus();
  }

  /* ---------- súbory (fotka / PDF) ---------- */
  function suborBlok(sub, kde, text) {
    var h = '<div class="mz-subor" data-subor="' + kde + '">';
    if (sub && sub.url) {
      var pdf = sub.typ === "application/pdf";
      h += '<div class="mz-subor__nahlad">' + (pdf ? '<span class="mz-subor__pdf">PDF</span>' : '<img src="' + esc(sub.url) + '" alt="Nahraný súbor">') +
        '<div><b>' + esc(sub.nazov || (pdf ? "menu.pdf" : "fotka")) + "</b>" +
        '<a href="' + esc(sub.url) + '" target="_blank" rel="noopener">Otvoriť</a></div></div>';
    }
    h += '<label class="mz-upload"><input type="file" accept="image/*,application/pdf" data-subor-vstup="' + kde + '">' +
      "<span>" + (sub && sub.url ? "Nahrať iný súbor" : text) + "</span><small>Fotka z telefónu alebo PDF, najviac 10 MB</small></label>" +
      '<p class="mz-subor__stav" data-subor-stav="' + kde + '" aria-live="polite"></p>' +
      (sub && sub.url ? '<button class="mz-tl mz-tl--maly mz-tl--tichy" type="button" data-subor-zmaz="' + kde + '">Odstrániť súbor</button>' : "") + "</div>";
    return h;
  }
  function viazSubor(p, kde) {
    var vstup = p.querySelector('[data-subor-vstup="' + kde + '"]');
    if (vstup) vstup.addEventListener("change", function () { if (vstup.files[0]) nahraj(vstup.files[0], kde); });
    var z = p.querySelector('[data-subor-zmaz="' + kde + '"]');
    if (z) z.onclick = function () { stav[kde].subor = null; zmeny[kde] = true; kresli(); aktualizujStav(); };
  }
  function zmensi(f) { // fotka -> JPEG, dlhšia strana najviac 2000 px (rýchle nahratie aj na mobilných dátach)
    return new Promise(function (ok, zle) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? ok(b) : zle(new Error("Fotku sa nepodarilo spracovať.")); }, "image/jpeg", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); zle(new Error("Tento formát fotky prehliadač nevie otvoriť. Skúste JPG alebo PNG.")); };
      img.src = url;
    });
  }
  function nahraj(f, kde) {
    var st = $('[data-subor-stav="' + kde + '"]');
    var pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    var obr = /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
    if (!pdf && !obr) { st.textContent = "Nahrať sa dá len fotka alebo PDF."; st.className = "mz-subor__stav mz-chyba"; return; }
    if (pdf && f.size > MAX_PDF) { st.textContent = "PDF je väčšie ako 10 MB. Zmenšite ho alebo nahrajte fotku."; st.className = "mz-subor__stav mz-chyba"; return; }
    st.className = "mz-subor__stav"; st.textContent = pdf ? "Nahrávam PDF…" : "Pripravujem fotku…";
    var meno = f.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg");
    (pdf ? Promise.resolve(f) : zmensi(f)).then(function (b) {
      if (b.size > MAX_PDF) throw new Error("Súbor je väčší ako 10 MB.");
      st.textContent = "Nahrávam…";
      return api("POST", "/soubor/" + SITE, b, { "Content-Type": pdf ? "application/pdf" : "image/jpeg", "X-Nazov": encodeURIComponent(meno) });
    }).then(function (d) {
      stav[kde].subor = { id: d.id, url: d.url, typ: d.typ, nazov: d.nazov };
      if (kde === "menu") stav.menu.rezim = "subor";
      zmeny[kde] = true; kresli(); aktualizujStav();
      toast("Súbor je nahraný. Ťuknite na Uložiť a bude na webe.");
    }, function (ch) {
      if (ch.status === 401) { prihlasZnova(function () { nahraj(f, kde); }); return; }
      st.className = "mz-subor__stav mz-chyba"; st.textContent = ch.message;
    });
  }

  /* ---------- jedálny lístok ---------- */
  function kresliListok() {
    var l = stav.listok, p = $("#panel-listok");
    p.innerHTML = '<div class="mz-uvod"><h1>Jedálny lístok</h1><p class="mz-tichy">Keď zmeníte stály lístok, nahrajte ho sem ako PDF alebo fotky. Na webe sa zobrazí na stránke Jedálny lístok.</p></div>' +
      '<div class="mz-karta">' + suborBlok(l.subor, "listok", "Nahrať jedálny lístok") +
      '<label class="mz-check"><input type="checkbox" id="skryt-povodny"' + (l.skryt_povodny !== false ? " checked" : "") + ">" +
      "<span>Na webe ukázať len nahraný lístok (pôvodný zoznam jedál skryť)</span></label></div>" +
      '<p class="mz-tichy mz-pozn">Jednotlivé ceny a jedlá v pôvodnom lístku na webe zatiaľ upravujeme my: pošlite nám zmeny na <a href="mailto:info.webhunter@email.cz">info.webhunter@email.cz</a>.</p>';
    $("#skryt-povodny").onchange = function (ev) { stav.listok.skryt_povodny = ev.target.checked; zmeny.listok = true; aktualizujStav(); };
    viazSubor(p, "listok");
  }
  /* ---------- otváracie hodiny ---------- */
  function kresliHodiny() {
    var h = stav.hodiny, p = $("#panel-hodiny");
    p.innerHTML = '<div class="mz-uvod"><h1>Otváracie hodiny</h1><p class="mz-tichy">Zmeňte hodiny, keď sa menia počas roka. Po uložení sa zmenia na celom webe: na úvode, v kontakte aj pri rezervácii.</p></div>' +
      '<div class="mz-karta mz-hodiny">' + h.map(function (r, i) {
        return '<div class="mz-riadok mz-hodiny__r">' + pole("hodiny." + i + ".0", "Deň alebo dni", { cls: "mz-pole--nazov", ph: "Napr. Pondelok alebo Streda až Štvrtok" }) +
          pole("hodiny." + i + ".1", "Otvorené", { ph: "11:00 až 14:30", ac: false }) +
          '<div class="mz-hodiny__akcie">' +
          '<button class="mz-x" type="button" data-akcia="hod-hore" data-i="' + i + '" aria-label="Posunúť vyššie"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
          '<button class="mz-x" type="button" data-akcia="hod-dole" data-i="' + i + '" aria-label="Posunúť nižšie"' + (i === h.length - 1 ? " disabled" : "") + ">↓</button>" +
          '<button class="mz-x" type="button" data-akcia="hod-zmaz" data-i="' + i + '" aria-label="Odstrániť riadok">×</button></div></div>';
      }).join("") +
      '<button class="mz-pridat" type="button" data-akcia="hod-pridaj">+ Pridať riadok</button></div>' +
      '<p class="mz-tichy mz-pozn">Zatvorený deň napíšte ako „Zatvorené“. Dve časti dňa oddeľte čiarkou, napríklad „11:00 až 14:30, 17:00 až 21:00“.</p>' +
      (POVODNE.hodiny && POVODNE.hodiny.length ? '<button class="mz-tl mz-tl--maly mz-tl--tichy" type="button" data-akcia="hod-povodne">Vrátiť hodiny z webu</button>' : "");
  }
  function akciaHodiny(a, i) {
    var h = stav.hodiny;
    if (a === "hod-pridaj") { h.push(["", ""]); }
    else if (a === "hod-zmaz") { h.splice(i, 1); }
    else if (a === "hod-hore" && i > 0) { h.splice(i - 1, 0, h.splice(i, 1)[0]); }
    else if (a === "hod-dole" && i < h.length - 1) { h.splice(i + 1, 0, h.splice(i, 1)[0]); }
    else if (a === "hod-povodne") { stav.hodiny = kopia(POVODNE.hodiny || []); }
    else return;
    zmeny.hodiny = true; kresliHodiny(); aktualizujStav();
    if (a === "hod-pridaj") { var el = $('[data-cesta="hodiny.' + (h.length - 1) + '.0"]'); if (el) el.focus(); }
  }
  function cisteHodiny() {
    return (stav.hodiny || []).map(function (r) { return [String(r[0] || "").trim(), String(r[1] || "").trim()]; })
      .filter(function (r) { return r[0] || r[1]; });
  }

  function kresli() { kresliMenu(); kresliListok(); kresliHodiny(); }

  /* ---------- uloženie ---------- */
  function cena(c) {
    c = String(c || "").replace(/€/g, "").trim().replace(".", ",");
    if (!c) return "";
    if (/^\d+$/.test(c)) c += ",00"; else if (/^\d+,\d$/.test(c)) c += "0";
    return c + " €";
  }
  function cisteMenu() {
    var m = kopia(stav.menu);
    m.dni = (m.dni || []).map(function (d) {
      return { den: d.den, datum: d.datum || "",
        polievka: (d.polievka || []).filter(function (x) { return String(x.nazov || "").trim(); })
          .map(function (x) { return { nazov: x.nazov.trim(), mnozstvo: String(x.mnozstvo || "").trim(), alergeny: String(x.alergeny || "").replace(/\s+/g, "") }; }),
        jedla: (d.jedla || []).filter(function (x) { return String(x.nazov || "").trim(); })
          .map(function (x) { return { nazov: x.nazov.trim(), mnozstvo: String(x.mnozstvo || "").trim(), cena: cena(x.cena), alergeny: String(x.alergeny || "").replace(/\s+/g, "") }; }) };
    });
    if (m.rezim !== "subor") m.tyzden = tyzdenText(m.dni) || m.tyzden || "";
    return m;
  }
  function uloz() {
    if (!neulozene()) return Promise.resolve(true);
    if (zmeny.hodiny && !cisteHodiny().length) {
      toast("Napíšte aspoň jeden riadok otváracích hodín.", true); return Promise.resolve(false);
    }
    if (stav.menu.rezim === "subor" && zmeny.menu && !(stav.menu.subor && stav.menu.subor.url)) {
      toast("Najprv nahrajte fotku alebo PDF menu, alebo prepnite na „Napísať po dňoch“.", true); return Promise.resolve(false);
    }
    var telo = {};
    if (zmeny.menu) telo.menu = cisteMenu();
    if (zmeny.listok) telo.listok = kopia(stav.listok);
    if (zmeny.hodiny) telo.hodiny = cisteHodiny();
    var tl = $("#ulozit"); tl.disabled = true; tl.textContent = "Ukladám…";
    return api("POST", "/menu/" + SITE, JSON.stringify(telo), { "Content-Type": "application/json" }).then(function (d) {
      ulozene = d;
      if (telo.menu) stav.menu = kopia(d.menu);
      if (telo.hodiny) stav.hodiny = kopia(d.hodiny);
      zmeny.menu = zmeny.listok = zmeny.hodiny = false;
      try { localStorage.setItem("menu-zive:" + SITE, JSON.stringify({ cas: Date.now(), doc: d })); } catch (ex) {}
      kresli(); aktualizujStav();
      toast("Uložené. Na webe je zmena hneď.", false, true);
      return true;
    }, function (ch) {
      tl.textContent = "Uložiť"; aktualizujStav();
      if (ch.status === 401) { prihlasZnova(uloz); return false; }
      toast("Neuložené: " + ch.message, true);
      return false;
    });
  }
  function prihlasZnova(potom) {
    zmazToken(); poPrihlaseni = potom;
    ukazLogin("Prihlásenie vypršalo. Zadajte heslo znova, zmeny ostanú.");
  }
  $("#ulozit").onclick = uloz;
  document.addEventListener("keydown", function (ev) { if ((ev.metaKey || ev.ctrlKey) && ev.key === "s" && !app.hidden) { ev.preventDefault(); uloz(); } });
  function aktualizujStav() {
    var neul = neulozene(), s = $("#stav"), tl = $("#ulozit");
    s.className = "mz-lista__stav" + (neul ? " mz-lista__stav--zmeny" : "");
    s.textContent = neul ? "Neuložené zmeny" : ulozene && ulozene.upravene ? "Uložené " + kedy(ulozene.upravene) : "Zatiaľ neuložené";
    tl.disabled = !neul; tl.textContent = "Uložiť";
  }
  window.addEventListener("beforeunload", function (ev) { if (neulozene()) { ev.preventDefault(); ev.returnValue = ""; } });

  /* ---------- toast a potvrdenie ---------- */
  var tt;
  function toast(text, chyba, odkaz) {
    var t = $("#toast");
    t.className = "mz-toast" + (chyba ? " mz-toast--chyba" : "");
    t.innerHTML = "<span>" + esc(text) + "</span>" +
      (odkaz ? '<a href="../' + (tab === "listok" ? "jedalny-listok/" : tab === "hodiny" ? "kontakt/" : "menu/") + '?z=admin">Zobraziť na webe</a>' : "");
    t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, odkaz ? 9000 : 5000);
  }
  var dlg = document.createElement("dialog");
  dlg.className = "mz-dialog";
  document.body.appendChild(dlg);
  function potvrd(nadpis, text, tlacidlo, ano) {
    dlg.innerHTML = "<h2>" + esc(nadpis) + "</h2><p>" + esc(text) + '</p><div class="mz-dialog__akcie">' +
      '<button class="mz-tl" type="button" value="nie">Zrušiť</button><button class="mz-tl mz-tl--plne" type="button" value="ano">' + esc(tlacidlo) + "</button></div>";
    dlg.querySelector('[value="nie"]').onclick = function () { dlg.close(); };
    dlg.querySelector('[value="ano"]').onclick = function () { dlg.close(); ano(); };
    if (dlg.showModal) dlg.showModal(); else ano();
  }

  /* ---------- štart ---------- */
  if (BEZ_MENU) prepni("listok", true);
  token = citajToken();
  if (!token) ukazLogin();
  else api("GET", "/overit/" + SITE).then(nacitaj, function (ch) {
    if (ch.status === 401) { zmazToken(); ukazLogin(); } else nacitaj();
  });
})();
