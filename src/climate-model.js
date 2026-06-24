// Interaktives Klimamodell – reale Keeling-Daten + Faktor-Prognose.
// initClimateModel(root) verdrahtet das Widget innerhalb des übergebenen Elements.

export function initClimateModel(root) {
  if (!root || root.dataset.init) return;
  root.dataset.init = '1';

  // Physik: dT = S · log2(ppm / ppm_vorindustriell); S kalibriert auf 1,1 °C bei 415 ppm (2020)
  const PPM_PI = 278, ANKER_PPM = 415, ANKER_WARMING = 1.1;
  const KLIMASENS = ANKER_WARMING / Math.log2(ANKER_PPM / PPM_PI);
  const KEELING = 1.0031, PARIS_15 = 1.5, PARIS_20 = 2.0, ENDJAHR = 2100;
  const warmingOf = ppm => KLIMASENS * Math.log2(ppm / PPM_PI);

  // Reale Keeling-Daten (Mauna Loa, NOAA/Scripps Jahresmittel in ppm)
  const KEELING_DATA = {
    1958: 315.33, 1959: 315.98, 1960: 316.91, 1961: 317.64, 1962: 318.45, 1963: 318.99, 1964: 319.62,
    1965: 320.04, 1966: 321.38, 1967: 322.16, 1968: 323.04, 1969: 324.62, 1970: 325.68, 1971: 326.32,
    1972: 327.45, 1973: 329.68, 1974: 330.18, 1975: 331.11, 1976: 332.04, 1977: 333.83, 1978: 335.40,
    1979: 336.84, 1980: 338.75, 1981: 340.11, 1982: 341.45, 1983: 343.05, 1984: 344.65, 1985: 346.12,
    1986: 347.42, 1987: 349.19, 1988: 351.57, 1989: 353.12, 1990: 354.39, 1991: 355.61, 1992: 356.45,
    1993: 357.10, 1994: 358.83, 1995: 360.82, 1996: 362.61, 1997: 363.73, 1998: 366.70, 1999: 368.38,
    2000: 369.55, 2001: 371.14, 2002: 373.28, 2003: 375.80, 2004: 377.52, 2005: 379.80, 2006: 381.90,
    2007: 383.79, 2008: 385.60, 2009: 387.43, 2010: 389.90, 2011: 391.65, 2012: 393.85, 2013: 396.52,
    2014: 398.65, 2015: 400.83, 2016: 404.24, 2017: 406.55, 2018: 408.52, 2019: 411.44, 2020: 414.24,
    2021: 416.45, 2022: 418.56, 2023: 421.08, 2024: 424.61, 2025: 426.90
  };
  const HIST_START = 1958, LAST_REAL = 2025;
  const INCR0 = (KEELING_DATA[LAST_REAL] - KEELING_DATA[LAST_REAL - 10]) / 10;

  function simuliere(faktor, massnahmenJahr) {
    const jahre = [], ppm = [], warming = [];
    for (let y = HIST_START; y <= LAST_REAL; y++) {
      jahre.push(y); ppm.push(KEELING_DATA[y]); warming.push(warmingOf(KEELING_DATA[y]));
    }
    let konz = KEELING_DATA[LAST_REAL], incr = INCR0;
    for (let y = LAST_REAL + 1; y <= ENDJAHR; y++) {
      konz += Math.max(0, incr); // CO2 kann nur dazukommen, nie entfernt werden
      jahre.push(y); ppm.push(konz); warming.push(warmingOf(konz));
      const f = (y < massnahmenJahr) ? KEELING : faktor;
      incr = incr * f;
    }
    return { jahre, ppm, warming };
  }
  function jahrDerSchwelle(res, s) {
    for (let i = 0; i < res.jahre.length; i++) if (res.warming[i] >= s) return res.jahre[i];
    return null;
  }

  const canvas = root.querySelector('.km-chart');
  const ctx = canvas.getContext('2d');
  function farbeFuer(f) {
    if (f <= 0.99) return { c: '#2e8b3d', name: 'Prognose niedrig' };
    if (f < KEELING) return { c: '#00786a', name: 'Prognose mittel' };
    if (f <= 1.004) return { c: '#e8a020', name: 'Prognose mittelhoch' };
    return { c: '#d62728', name: 'Prognose hoch' };
  }

  function zeichne(res, faktor, massnahmenJahr) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.parentElement.clientWidth;
    const cssH = Math.max(300, Math.min(520, cssW * 0.6));
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 52, padR = 16, padT = 40, padB = 46;
    const x0 = padL, x1 = cssW - padR, y0 = cssH - padB, y1 = padT;
    const jahrMin = HIST_START, jahrMax = ENDJAHR, tMin = 0;
    const tMax = Math.ceil(Math.max(...res.warming, PARIS_20) * 2) / 2 + 0.25;
    const sx = j => x0 + (j - jahrMin) / (jahrMax - jahrMin) * (x1 - x0);
    const sy = v => y0 - (v - tMin) / (tMax - tMin) * (y0 - y1);

    ctx.fillStyle = '#003936'; ctx.font = "600 15px Poppins, Helvetica, Arial, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Anthropogene Erwärmung seit der Industrialisierung [°C]', (x0 + x1) / 2, 22);

    ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();

    ctx.font = '12px Inter, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const yStep = (tMax - tMin) > 6 ? 1 : 0.5;
    for (let v = 0; v <= tMax + 1e-9; v += yStep) {
      const y = sy(v);
      ctx.strokeStyle = '#dee2e6'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = '#6c757d'; ctx.fillText(v.toFixed(1), x0 - 8, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let j = 1960; j <= jahrMax; j += 20) {
      const x = sx(j);
      ctx.strokeStyle = '#adb5bd'; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 4); ctx.stroke();
      ctx.fillStyle = '#6c757d'; ctx.fillText(j, x, y0 + 7);
    }
    ctx.fillStyle = '#6c757d'; ctx.font = '13px Inter, Helvetica, Arial, sans-serif';
    ctx.fillText('Jahr', (x0 + x1) / 2, y0 + 26);

    [[PARIS_15, '1,5 °C (Paris)'], [PARIS_20, '2 °C']].forEach(([v, label]) => {
      const y = sy(v);
      ctx.strokeStyle = '#c4926a'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#b07a4e'; ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, x1 - 2, y - 2);
    });

    function vMarker(jahr, label, color) {
      const x = sx(jahr);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(label, x, y1 + 2);
    }
    vMarker(LAST_REAL, 'Prognose →', '#adb5bd');
    if (massnahmenJahr > LAST_REAL + 1) vMarker(massnahmenJahr, 'Maßnahmen', '#00786a');

    function segment(a, b, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = a; i <= b; i++) { const x = sx(res.jahre[i]), y = sy(res.warming[i]); i === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    const splitIdx = LAST_REAL - HIST_START;
    const sz = farbeFuer(faktor);
    segment(0, splitIdx, '#003936', 2.2);
    segment(splitIdx, res.jahre.length - 1, sz.c, 2.4);

    const lx = x0 + 12, ly = y1 + 14;
    const eintraege = [
      { c: '#003936', t: 'Keeling-Messdaten 1958–2025' },
      { c: sz.c, t: sz.name + ' (Faktor ' + faktor.toFixed(4) + ')' },
    ];
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.globalAlpha = .88;
    ctx.fillRect(lx - 6, ly - 6, 236, eintraege.length * 20 + 6);
    ctx.globalAlpha = 1; ctx.strokeStyle = '#dee2e6'; ctx.strokeRect(lx - 6, ly - 6, 236, eintraege.length * 20 + 6);
    ctx.restore();
    ctx.font = '12px Inter, sans-serif'; ctx.textBaseline = 'middle';
    eintraege.forEach((e, i) => {
      const yy = ly + 8 + i * 20;
      ctx.strokeStyle = e.c; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(lx, yy); ctx.lineTo(lx + 26, yy); ctx.stroke();
      ctx.fillStyle = '#212529'; ctx.textAlign = 'left'; ctx.fillText(e.t, lx + 32, yy);
    });
  }

  const slider = root.querySelector('.km-slider');
  const numFactor = root.querySelector('.km-numFactor');
  const factorVal = root.querySelector('.km-factorVal');
  const yearSlider = root.querySelector('.km-year');
  const yearVal = root.querySelector('.km-yearVal');
  const readout = root.querySelector('.km-readout');
  let aktFaktor = KEELING, aktJahr = 2026;

  function aktualisiere() {
    let faktor = Math.round(parseFloat(slider.value) * 1e6) / 1e6;
    aktFaktor = faktor; aktJahr = parseInt(yearSlider.value, 10);
    factorVal.textContent = faktor.toFixed(4);
    numFactor.value = faktor.toFixed(4);
    yearVal.textContent = aktJahr;

    const res = simuliere(faktor, aktJahr);
    zeichne(res, faktor, aktJahr);

    const pct = (faktor - 1) * 100;
    let zustand = 'Keeling-Trend';
    if (faktor < KEELING) zustand = 'Einsparung'; else if (faktor > KEELING) zustand = 'stärkerer Anstieg';
    const j15 = jahrDerSchwelle(res, PARIS_15);
    const erw2100 = res.warming[res.warming.length - 1];
    const ppm2100 = res.ppm[res.ppm.length - 1];
    const massnahmeTxt = aktJahr <= LAST_REAL + 1 ? 'ab sofort' : 'ab ' + aktJahr;

    readout.innerHTML =
      'Faktor <b>' + faktor.toFixed(4) + '</b> (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + ' %/Jahr, ' + zustand + '), wirksam ' + massnahmeTxt + '. ' +
      '2100: <b>' + erw2100.toFixed(2) + ' °C</b> über vorindustriell, CO₂ ≈ <b>' + Math.round(ppm2100) + ' ppm</b>. ' +
      (j15 ? '1,5 °C erreicht: <b>' + j15 + '</b>.' : '1,5 °C wird bis 2100 nicht erreicht.');
  }

  slider.addEventListener('input', aktualisiere);
  yearSlider.addEventListener('input', aktualisiere);
  numFactor.addEventListener('change', e => {
    const v = parseFloat(e.target.value.replace(',', '.'));
    if (!isNaN(v)) { slider.value = Math.min(slider.max, Math.max(slider.min, v)); aktualisiere(); }
  });
  root.querySelector('.km-keelingBtn').addEventListener('click', () => { slider.value = KEELING; aktualisiere(); });
  window.addEventListener('resize', () => zeichne(simuliere(aktFaktor, aktJahr), aktFaktor, aktJahr));

  aktualisiere();
}
