/*
 * Aura — porównanie tego, co pokazuje aplikacja, z innymi źródłami pogody.
 *
 * JAK UŻYĆ (30 sekund):
 *  1. Otwórz Aurę, wybierz miejsce i poczekaj, aż pogoda się załaduje.
 *  2. Otwórz konsolę przeglądarki (Chrome na komputerze: F12 → zakładka Console).
 *     Na telefonie najłatwiej: Chrome na komputerze + ten sam adres strony.
 *  3. Wklej CAŁY ten plik i naciśnij Enter.
 *  4. Wynik: tabela w konsoli + skopiowany do schowka JSON (wklej go do rozmowy z Claude).
 *
 * Skrypt niczego nie zmienia w aplikacji. Tylko czyta jej stan (S) i pyta publiczne API:
 *  - Open-Meteo: best_match, icon_d2, icon_eu, ecmwf_ifs025, gfs_seamless, meteofrance_seamless
 *  - MET Norway (yr.no) locationforecast 2.0
 *  - IMGW: stacja, z której korzysta Aura (S.imgwData) — bez dodatkowych zapytań
 */
(async () => {
  const APP = (typeof S !== "undefined") ? S : null;
  if (!APP || !APP.data || APP.lat == null) { console.error("Najpierw wybierz lokalizację i poczekaj na załadowanie pogody."); return; }
  const X = APP.X || (typeof computeCtx === "function" ? computeCtx() : null);
  if (!X) { console.error("Brak S.X — odśwież pogodę w aplikacji i spróbuj ponownie."); return; }
  const lat = +APP.lat, lng = +APP.lng;
  const num = v => (v === null || v === undefined || v === "" || Number.isNaN(+v)) ? null : +v;
  const r1 = v => v === null ? null : Math.round(v * 10) / 10;
  const med = a => { const b = a.filter(x => x !== null).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const tget = async (url, ms = 12000) => { const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  // ── 1. Open-Meteo, surowo, po jednym modelu (bez żadnej obróbki Aury)
  const MODELS = ["best_match", "icon_d2", "icon_eu", "ecmwf_ifs025", "gfs_seamless", "meteofrance_seamless"];
  const cur = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover,visibility,precipitation,weather_code,uv_index";
  const om = {};
  await Promise.all(MODELS.map(async m => {
    try {
      const d = await tget(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=${cur}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&forecast_days=1&timezone=auto&models=${m}`);
      om[m] = { c: d.current || {}, d: d.daily || {} };
    } catch (e) { om[m] = { err: String(e.message || e) }; }
  }));

  // ── 2. MET Norway (yr.no)
  let met = null, metErr = null;
  try {
    const d = await tget(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`);
    const ts = d.properties.timeseries, now = Date.now();
    let i = 0; for (let k = 0; k < ts.length; k++) { if (new Date(ts[k].time).getTime() <= now) i = k; else break; }
    const inst = ts[i].data.instant.details, n1 = ts[i].data.next_1_hours || {};
    met = { time: ts[i].time, ...inst, precip1h: n1.details && n1.details.precipitation_amount, symbol: n1.summary && n1.summary.symbol_code };
  } catch (e) { metErr = String(e.message || e); }

  // ── 3. IMGW — dokładnie to, z czego korzysta Aura
  const im = APP.imgwData || null, raw = (im && (im.rawStation || im)) || {};
  const imgw = im ? {
    name: im.stacja || im.name, dist: im.dist, ageMin: im.latestAgeMinutes ?? im.ageMinutes,
    T: num(raw.temperatura_powietrza ?? raw.temperatura), RH: num(raw.wilgotnosc_wzgledna),
    wind: num(raw.wiatr_srednia_predkosc ?? raw.predkosc_wiatru) === null ? null : num(raw.wiatr_srednia_predkosc ?? raw.predkosc_wiatru) * 3.6,
    gust: num(raw.wiatr_predkosc_maksymalna ?? raw.wiatr_poryw_10min) === null ? null : num(raw.wiatr_predkosc_maksymalna ?? raw.wiatr_poryw_10min) * 3.6,
    dir: num(raw.wiatr_kierunek ?? raw.kierunek_wiatru), press: num(raw.cisnienie), precip10: num(raw.opad_10min ?? raw.suma_opadu)
  } : null;

  // ── 4. wartości Aury (to, co jest na ekranie)
  const c = APP.data.current || {};
  const app = {
    T: num(X.T), feels: num(X.feels), RH: num(X.hum), dew: num(X.dewStation ?? X.dew), wind: num(X.wind), gust: num(X.gusts), dir: num(X.wdeg),
    press: num(X.press), cloud: num(X.cloud), vis: num(X.visKm), uv: num(X.uv), precip: num(X.precip), code: num(X.code),
    maxT: num(X.maxT), minT: num(X.minT), rainToday: num(X.rainToday), popMax: num(X.popMax)
  };

  // ── 5. tabela porównawcza
  const omv = (m, k) => om[m] && om[m].c ? num(om[m].c[k]) : null;
  const rows = [];
  const add = (label, unit, appV, per, tol, angular) => {
    const others = Object.values(per).filter(v => v !== null && v !== undefined);
    const md = med(others);
    const dApp = (appV !== null && md !== null) ? (angular ? angDiff(appV, md) : appV - md) : null;
    const spread = others.length > 1 ? (angular ? null : Math.max(...others) - Math.min(...others)) : null;
    rows.push({ Wielkość: label, Jedn: unit, Aura: r1(appV), ...Object.fromEntries(Object.entries(per).map(([k, v]) => [k, r1(v ?? null)])),
      "Mediana innych": r1(md), "Aura − mediana": r1(dApp), "Rozrzut innych": r1(spread), Flaga: (dApp !== null && Math.abs(dApp) > tol) ? "⚠ różnica" : "" });
  };
  const perModel = k => Object.fromEntries(MODELS.map(m => ["OM " + m, omv(m, k)]));
  const metv = k => met ? num(met[k]) : null;

  add("Temperatura", "°C", app.T, { ...perModel("temperature_2m"), "MET Norway": metv("air_temperature"), "IMGW": imgw && imgw.T }, 1.5);
  add("Odczuwalna", "°C", app.feels, { ...perModel("apparent_temperature") }, 3);
  add("Wilgotność", "%", app.RH, { ...perModel("relative_humidity_2m"), "MET Norway": metv("relative_humidity"), "IMGW": imgw && imgw.RH }, 10);
  add("Punkt rosy", "°C", app.dew, { ...perModel("dew_point_2m"), "MET Norway": metv("dew_point_temperature") }, 2);
  add("Wiatr średni", "km/h", app.wind, { ...perModel("wind_speed_10m"), "MET Norway": metv("wind_speed") === null ? null : metv("wind_speed") * 3.6, "IMGW": imgw && imgw.wind }, 8);
  add("Porywy", "km/h", app.gust, { ...perModel("wind_gusts_10m"), "MET Norway": metv("wind_speed_of_gust") === null ? null : metv("wind_speed_of_gust") * 3.6, "IMGW (max 10 min)": imgw && imgw.gust }, 12);
  add("Kierunek wiatru", "°", app.dir, { ...perModel("wind_direction_10m"), "MET Norway": metv("wind_from_direction"), "IMGW": imgw && imgw.dir }, 45, true);
  add("Ciśnienie (MSL)", "hPa", app.press, { ...perModel("pressure_msl"), "MET Norway": metv("air_pressure_at_sea_level"), "IMGW": imgw && imgw.press }, 3);
  add("Zachmurzenie", "%", app.cloud, { ...perModel("cloud_cover"), "MET Norway": metv("cloud_area_fraction") }, 30);
  add("Widoczność", "km", app.vis, Object.fromEntries(MODELS.map(m => ["OM " + m, omv(m, "visibility") === null ? null : omv(m, "visibility") / 1000])), 5);
  add("UV", "", app.uv, { ...perModel("uv_index"), "MET (bezchmurne)": metv("ultraviolet_index_clear_sky") }, 1.5);
  add("Opad (teraz)", "mm", app.precip, { ...perModel("precipitation"), "MET next 1h": met ? num(met.precip1h) : null, "IMGW 10 min": imgw && imgw.precip10 }, 0.3);
  add("Max dnia", "°C", app.maxT, Object.fromEntries(MODELS.map(m => ["OM " + m, om[m] && om[m].d ? num(om[m].d.temperature_2m_max && om[m].d.temperature_2m_max[0]) : null])), 2);
  add("Min dnia", "°C", app.minT, Object.fromEntries(MODELS.map(m => ["OM " + m, om[m] && om[m].d ? num(om[m].d.temperature_2m_min && om[m].d.temperature_2m_min[0]) : null])), 2);
  add("Opady dziś (suma)", "mm", app.rainToday, Object.fromEntries(MODELS.map(m => ["OM " + m, om[m] && om[m].d ? num(om[m].d.precipitation_sum && om[m].d.precipitation_sum[0]) : null])), 1);

  // ── 6. kod pogody (tekstowo, bo skale się różnią)
  const codes = { "Aura (WMO)": app.code, ...Object.fromEntries(MODELS.map(m => ["OM " + m, omv(m, "weather_code")])), "MET symbol": met ? met.symbol : null };

  const report = {
    czas: new Date().toISOString(), miejsce: { nazwa: APP.city, lat, lng }, model_aury: (typeof activeModel !== "undefined" ? activeModel.id : null),
    tryb_zrodla: APP.sourceMode || null, fuzja: APP.fusion ? { stacja: APP.fusion.station, dist_km: APP.fusion.distanceKm, wiek_min: APP.fusion.ageMinutes, waga: APP.fusion.weight } : null,
    stacja_imgw: imgw, met_norway: met || { blad: metErr }, open_meteo_bledy: Object.fromEntries(Object.entries(om).filter(([, v]) => v.err).map(([k, v]) => [k, v.err])),
    tabela: rows, kody_pogody: codes,
    aqi_aury: APP.air ? { european_aqi: APP.air.european_aqi, pm10: APP.air.pm10, pm2_5: APP.air.pm2_5 } : null
  };
  window.__auditReport = report;

  console.log("%cAURA — porównanie źródeł  " + report.czas, "font-weight:bold;font-size:14px");
  console.log("Miejsce:", APP.city, `(${lat.toFixed(4)}, ${lng.toFixed(4)})`, "| model Aury:", report.model_aury, "| tryb:", report.tryb_zrodla, "| fuzja:", report.fuzja);
  if (imgw) console.log("Stacja IMGW użyta przez Aurę:", imgw);
  if (metErr) console.warn("MET Norway niedostępny:", metErr);
  console.table(rows);
  console.log("Kody pogody:", codes);
  try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); console.log("%cJSON skopiowany do schowka — wklej go do rozmowy.", "color:green"); }
  catch { console.log("Schowek zablokowany. Wpisz: copy(__auditReport)  (Chrome) i wklej wynik."); }
  return report;
})();
