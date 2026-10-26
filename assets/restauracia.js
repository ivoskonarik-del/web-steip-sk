/* Spoločné správanie podstránok všetkých šablón (restauracia/site/spolocne.py, „podstránky“).
   Rezervácia: form[data-rezervacia] -> otvorí e-mail s vyplnenou rezerváciou (statický web, bez servera).
   Mapa: [data-mapa] sa načíta až po kliknutí (bez cookies Googlu, kým o ňu hosť nepožiada).
   Galéria: [data-galeria] a[data-lightbox] -> prehliadač cez celú obrazovku (šípky, Esc, potiahnutie). */
(function () {
  "use strict";

  // ---------------------------------------------------------------- rezervácia
  document.querySelectorAll("form[data-rezervacia]").forEach(function (f) {
    var d = f.querySelector('[name="datum"]');
    if (d && !d.value) {
      var t = new Date();
      d.min = t.toISOString().slice(0, 10);
    }
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      var v = function (n) { var el = f.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ""; };
      var datum = v("datum");
      if (datum) {
        var x = datum.split("-");
        datum = Number(x[2]) + ". " + Number(x[1]) + ". " + x[0];
      }
      var predmet = "Rezervácia stola: " + [datum, v("cas"), v("osoby") ? v("osoby") + " os." : ""].filter(Boolean).join(", ");
      var telo = [
        "Dobrý deň,", "", "prosím o rezerváciu stola:", "",
        "Dátum: " + datum, "Čas: " + v("cas"), "Počet osôb: " + v("osoby"),
        v("poznamka") ? "Poznámka: " + v("poznamka") : "", "",
        "Meno: " + v("meno"), "Telefón: " + v("telefon"), "", "Ďakujem."
      ].filter(function (r, i, a) { return r !== "" || a[i - 1] !== ""; }).join("\n");
      var stav = f.querySelector("[data-rezervacia-stav]");
      if (stav) stav.textContent = "Otvárame Vám e-mail s vyplnenou rezerváciou. Stačí ho odoslať, potvrdíme Vám ju.";
      location.href = "mailto:" + (f.dataset.email || "") + "?subject=" + encodeURIComponent(predmet) +
        "&body=" + encodeURIComponent(telo);
    });
  });

  // ---------------------------------------------------------------- mapa na kliknutie
  document.querySelectorAll("[data-mapa]").forEach(function (box) {
    var b = box.querySelector("button");
    if (!b) return;
    b.addEventListener("click", function () {
      var i = document.createElement("iframe");
      i.src = box.dataset.mapa;
      i.title = "Mapa";
      i.loading = "lazy";
      i.referrerPolicy = "no-referrer-when-downgrade";
      i.setAttribute("allowfullscreen", "");
      i.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0";
      if (getComputedStyle(box).position === "static") box.style.position = "relative";
      box.appendChild(i);
      b.remove();
    });
  });

  // ---------------------------------------------------------------- dnešný deň v hodinách
  // <dl data-hodiny> s <dt>Pondelok - Štvrtok</dt><dd>…</dd>: zvýrazní riadok s dneškom (trieda .dnes)
  var DNI = ["nedeľa", "pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota"];
  var dnes = new Date().getDay();
  document.querySelectorAll("[data-hodiny] dt").forEach(function (dt) {
    var t = dt.textContent.toLowerCase().replace(/\s+/g, " ");
    var ix = DNI.map(function (d, i) { return t.indexOf(d.slice(0, 3)) > -1 ? i : -1; }).filter(function (i) { return i > -1; });
    var hit = false;
    if (/denne|každý deň|po ?- ?ne/.test(t)) hit = true;
    else if (ix.length === 1) hit = ix[0] === dnes;
    else if (ix.length >= 2 && /-|až/.test(t)) {
      var a = t.indexOf(DNI[ix[0]].slice(0, 3)) < t.indexOf(DNI[ix[1]].slice(0, 3)) ? ix[0] : ix[1];
      var b = a === ix[0] ? ix[1] : ix[0];
      var d = dnes, aa = a === 0 ? 7 : a, bb = b === 0 ? 7 : b, dd = d === 0 ? 7 : d;
      hit = aa <= bb ? dd >= aa && dd <= bb : dd >= aa || dd <= bb;
    } else hit = ix.indexOf(dnes) > -1;
    if (hit) {
      dt.classList.add("dnes");
      var dd2 = dt.nextElementSibling;
      if (dd2 && dd2.tagName === "DD") dd2.classList.add("dnes");
    }
  });

  // ---------------------------------------------------------------- galéria (lightbox)
  var odkazy = [].slice.call(document.querySelectorAll("[data-galeria] a[data-lightbox]"));
  if (!odkazy.length) return;
  var st = document.createElement("style");
  st.textContent =
    ".lb{position:fixed;inset:0;z-index:10000;background:rgba(12,12,12,.94);display:none;align-items:center;justify-content:center;touch-action:pan-y}" +
    ".lb.je{display:flex}.lb img{max-width:min(92vw,1600px);max-height:84vh;object-fit:contain;border-radius:4px;user-select:none}" +
    ".lb button{position:absolute;background:rgba(255,255,255,.12);color:#fff;border:0;width:48px;height:48px;border-radius:50%;font:400 26px/1 system-ui,sans-serif;cursor:pointer;display:grid;place-items:center}" +
    ".lb button:hover{background:rgba(255,255,255,.24)}.lb .lb-z{top:16px;right:16px}.lb .lb-p{left:16px;top:50%;transform:translateY(-50%)}.lb .lb-n{right:16px;top:50%;transform:translateY(-50%)}" +
    ".lb .lb-c{position:absolute;bottom:20px;left:0;right:0;text-align:center;color:#ddd;font:500 14px/1.4 system-ui,sans-serif}" +
    "@media(max-width:600px){.lb .lb-p,.lb .lb-n{top:auto;bottom:12px;transform:none}.lb .lb-c{bottom:28px}}";
  document.head.appendChild(st);
  var lb = document.createElement("div");
  lb.className = "lb";
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true");
  lb.setAttribute("aria-label", "Galéria");
  lb.innerHTML = '<img alt=""><button class="lb-z" aria-label="Zavrieť">×</button>' +
    '<button class="lb-p" aria-label="Predchádzajúca">‹</button><button class="lb-n" aria-label="Ďalšia">›</button><div class="lb-c"></div>';
  document.body.appendChild(lb);
  var img = lb.querySelector("img"), cap = lb.querySelector(".lb-c"), i = 0, spat = null;
  function ukaz(n) {
    i = (n + odkazy.length) % odkazy.length;
    img.src = odkazy[i].href;
    var a = odkazy[i].querySelector("img");
    img.alt = a ? a.alt : "";
    cap.textContent = (i + 1) + " / " + odkazy.length;
  }
  function zavri() { lb.classList.remove("je"); document.documentElement.style.overflow = ""; if (spat) spat.focus(); }
  odkazy.forEach(function (a, n) {
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      spat = a;
      ukaz(n);
      lb.classList.add("je");
      document.documentElement.style.overflow = "hidden";
      lb.querySelector(".lb-z").focus();
    });
  });
  lb.querySelector(".lb-z").onclick = zavri;
  lb.querySelector(".lb-p").onclick = function () { ukaz(i - 1); };
  lb.querySelector(".lb-n").onclick = function () { ukaz(i + 1); };
  lb.addEventListener("click", function (ev) { if (ev.target === lb) zavri(); });
  document.addEventListener("keydown", function (ev) {
    if (!lb.classList.contains("je")) return;
    if (ev.key === "Escape") zavri();
    if (ev.key === "ArrowLeft") ukaz(i - 1);
    if (ev.key === "ArrowRight") ukaz(i + 1);
  });
  var x0 = null;
  lb.addEventListener("touchstart", function (ev) { x0 = ev.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (ev) {
    if (x0 === null) return;
    var dx = ev.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) ukaz(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();
