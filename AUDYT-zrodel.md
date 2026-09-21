# Audyt komponentów pogodowych Aury: porównanie z innymi źródłami

- **Kod:** `Pogoda_claude` @ `35f9a99` (21.09.2026 06:57). Numery linii dotyczą `index.html` z tego commita.
- **Zakres:** każda wartość, którą aplikacja pokazuje na ekranie pogody (temperatura, odczuwalna, wilgotność, punkt rosy, wiatr, ciśnienie, zachmurzenie, widoczność, UV, opady, kod pogody, min/max, jakość powietrza, prognozy godzinowe/dzienne, tryb offline).

---

## 0. Co jest w tym audycie sprawdzone, a co nie

**Nie mogłem pobrać żywych danych z Open-Meteo ani MET Norway.** Sandbox blokuje te hosty (Open-Meteo zwraca `ROBOTS_DISALLOWED` dla automatycznych zapytań). Dlatego nie ma tu liczb typu „Aura pokazuje 18°, yr.no 17°”. Zamiast tego:

1. **Uruchomiłem prawdziwy kod Aury w Chromium** z kontrolowanymi wejściami: surowy model → stacja → to, co Aura faktycznie wyświetla. Stacja to **prawdziwy rekord IMGW Głodowo** (feed `/api/data/meteo`, 20.09 ok. 13:10–13:20 UTC: T 19,8°C, RH 69,2%, wiatr śr. 6,5 m/s, kierunek 217°, wiatr max 9,1 m/s, opad 10 min 0). Wartości modelu w tych testach są zamockowane, więc pokazują różnicę **wprowadzaną przez aplikację**, a nie błąd modelu.
2. **Porównałem formuły i definicje** z referencyjnymi (BoM Apparent Temperature, NWS wind chill, warianty Magnusa, skala Beauforta, oktanty).
3. **Przygotowałem skrypt `porownaj-zrodla.js`**, który u Ciebie w 30 s zbiera prawdziwe wartości z 6 modeli Open-Meteo, MET Norway i IMGW i zestawia je z tym, co pokazuje Aura (sekcja 6). Skrypt przetestowałem na mockach, na żywych API go nie uruchamiałem.

Wnioski o zachowaniu innych serwisów (yr.no, IMGW, AirVisual itd.) opieram na ich publicznych definicjach. Tam, gdzie piszę „z pamięci”, wartości trzeba potwierdzić.

**Naprawione od poprzedniego audytu (sprawdzone w kodzie):** odczuwalna przy ≥27°C (wcześniej −60°C, teraz `discomfortIndex`, L3094), traktowanie braku danych jako 0 w fuzji (`toFiniteNumber`, L2452+), wiek parametrów stacji (`tempAgeMinutes` i pozostałe, L916–919).

---

## 1. Skąd bierze się każda wartość

| Komponent | Surowe źródło | Obróbka w Aurze | Kod |
|---|---|---|---|
| Temperatura (hero, „Teraz”) | Open-Meteo `current.temperature_2m` | Fuzja z IMGW Głodowo (≤45 km, waga 1 przy ≤10 km i ≤30 min) | L2452 `applyObservationFusion` |
| Godziny +1…+3 | Open-Meteo hourly | „Most” od obserwacji do prognozy (zanikające przesunięcie) | L2523, L2434 |
| Odczuwalna | Open-Meteo `apparent_temperature` | **Po fuzji podmieniana własną formułą**: wind chill (≤10°C) lub `discomfortIndex` | L3094, L481 |
| Wilgotność, punkt rosy | Open-Meteo / IMGW | Fuzja; punkt rosy Magnus 17,62/243,12 | L1317 |
| Rosa x/15 | wyliczana | `dewWetness()` (port logiki z Pogoda-API) | L2012 |
| Wiatr średni, kierunek | Open-Meteo / IMGW | Fuzja (m/s→km/h ×3,6) | L2452 |
| Porywy | **tylko Open-Meteo** `wind_gusts_10m` | brak (stacja nieużywana) | L1520 |
| Ciśnienie | Open-Meteo `pressure_msl` | brak (Głodowo nie mierzy) | L1520 |
| Zachmurzenie | Open-Meteo `cloud_cover` | surowo; opis wg progów % (`wMeta`) | L306 |
| Widoczność | Open-Meteo `visibility` | **`sanitizeVisibility`**: min. 10 km, przy suchej stacji wymuszone 10 km | L2658 |
| Opad „teraz” | Open-Meteo `precipitation` / minutely_15 | **stacja ≤5 km z opadem 0 zeruje opad i kod** | L3188 |
| Kod pogody / ikona / opis | Open-Meteo `weather_code` | nadpisywany przez stację; opis z % chmur | L3188, L1679 |
| Max / min dnia | Open-Meteo daily | `syncDailyExtremes` rozszerza o obserwację i godziny | L2593 |
| UV | Open-Meteo `uv_index`, `uv_index_clear_sky` | brak | L1520 |
| Jakość powietrza, pyłki | Open-Meteo Air Quality (CAMS) | etykiety PL na skali EAQI | L2076 |
| Tryb IMGW offline | 3 modele | **średnia** ICON-EU + ECMWF + GFS zamiast jednego modelu | L1071 |

---

## 2. Wyniki liczbowe (prawdziwy rekord Głodowo + kod Aury)

### 2.1. Wartości: surowy model vs stacja vs Aura
Wejście: Tomaszewo, stacja Głodowo 3,7 km, dane sprzed 15–25 min. Model surowy (mock): T 18,0; odczuwalna 17,0; RH 62; wiatr 12; porywy 20; kierunek 220; ciśnienie 1016; chmury 60%; widoczność 24 km; kod 2.

| Wielkość | Model | Stacja | **Aura** | Aura − model |
|---|---|---|---|---|
| Temperatura | 18,0 | 19,8 | **19,8** | +1,8 |
| Odczuwalna | 17,0 | (brak) | **19** | +2,0 |
| Wilgotność | 62% | 69,2% | **69%** | +7 |
| Punkt rosy | 10,6 | 14,0 (z T i RH stacji) | **13,9** | +3,3 |
| Wiatr średni | 12 | 23,4 km/h | **23** | +11 |
| Porywy | 20 | max 10 min: 32,8 km/h | **20** | 0 (stacja pominięta) |
| Kierunek | 220° | 217° | **217°** | −3 |
| Ciśnienie | 1016 | (brak) | **1016** | 0 |
| Zachmurzenie | 60% | (brak) | **60%** | 0 |
| Widoczność | 24 km | (brak) | **10 km** | **−14 km** |
| Kod pogody | 2 | (brak) | **3** | zmieniony |
| T +1 h / +2 h / +3 h | 17,5 / 16,3 / 15,0 | – | **18,8 / 17,0 / 15,3** | +1,3 / +0,7 / +0,3 |

### 2.2. Odczuwalna: formuła Aury po fuzji vs BoM Apparent Temperature
(Aura − BoM, °C; BoM = Steadman, referencyjna formuła apparent temperature; Open-Meteo liczy własną wersję i dodatkowo uwzględnia promieniowanie, więc to porównanie orientacyjne)

| T | RH | wiatr | Aura | BoM | Różnica |
|---|---|---|---|---|---|
| 15 | 70% | 15 km/h | 15 | 12,0 | +3,0 |
| 20 | 70% | 0 | 19 | 21,4 | −2,4 |
| 20 | 70% | 25 km/h | 19 | 16,5 | +2,5 |
| 25 | 40% | 0 | 22 | 25,2 | −3,2 |
| 34 | 70% | 15 km/h | 47 | 39,3 | **+7,7** |

Cała siatka (T −5…34°C, RH 40–90%, wiatr 0–30 km/h): różnice od −6,4 do +18,1°C, średnia |Δ| = **3,5°C**. Skok na granicy 27°C (RH 60%): 26,9°C → **24**, 27,0°C → **28** (4°C przy zmianie o 0,1°C). Poniżej 27°C i powyżej 10°C wiatr w ogóle nie wpływa na wynik.

### 2.3. Punkt rosy, Beaufort, opisy chmur
- Punkt rosy: Magnus 17,62/243,12 różni się od Alduchova–Eskridge'a max o **0,014°C**, od Boltona o **0,039°C**. Bez znaczenia.
- Skala Beauforta w km/h zgodna z WMO (progi 1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118).
- Opis zachmurzenia: „Bezchmurnie” do 15% (1,2 okta), „Całkowite” od >90% (7,3 okta). Konwencja WMO/synoptyczna: pełne zachmurzenie to 8/8. To różnica konwencji, nie błąd.

### 2.4. Opady i kod pogody

| Scenariusz | Wejście | Co pokazuje Aura |
|---|---|---|
| Model: deszcz (kod 61, 0,4 mm), stacja ≤5 km: opad 10 min = 0 | konflikt | „Duże zachmurzenie”, opad 0, kod 3 (deszcz zdjęty) |
| Model: sucho (kod 3), stacja mierzy 1,2 mm/10 min | konflikt | „Całkowite zachmurzenie”, opad 0; karta stacji: „Opad 0 mm” |

Stacja może więc tylko **zdjąć** deszcz z prognozy, nigdy go **dodać**, a karta stacji pokazuje `suma_opadu` (pole SYNOP), którego Głodowo nie ma (ma `opad_10min`).

### 2.5. Tryb IMGW offline (3 modele → średnia)
Wejście: ICON-EU (T 17,0; deszcz 3 mm; kod 63; chmury 95%; widoczność 8 km), ECMWF (18,5; 0 mm; kod 2; 40%; 24 km), GFS (20,0; 0 mm; kod 1; 15%; 24 km).

| Wielkość | Średnia 3 modeli | **Aura** |
|---|---|---|
| Temperatura | 18,5 | 18,5 |
| Opad | 1,0 mm | 1 mm |
| Widoczność | 18,7 km | 18,7 km |
| Zachmurzenie | 50% | **95%** (tylko ICON-EU) |
| Kod / opis | – | **„Deszcz”** (kod 63, choć 2 z 3 modeli suche) |

---

## 3. Znalezione różnice i błędy

**Legenda:** 🔴 błąd (aplikacja pokazuje coś, czego nie ma w żadnym źródle lub jest sprzeczne wewnętrznie), 🟠 świadoma decyzja, która daje różnice względem innych serwisów, 🟡 różnica definicji, 🟢 zgodne.

| # | Komponent | Różnica | Skala | Werdykt |
|---|---|---|---|---|
| 1 | Widoczność | Przy suchej stacji ≤5 km wartość jest **wymuszona na 10 km** niezależnie od modelu (L2684–2686), a poza tym obowiązuje podłoga 10 km (ta sama instrukcja). Model mówi 24 km → Aura 10. Głodowo nie mierzy widoczności, więc to wartość wymyślona. | −14 km | 🔴 |
| 2 | Wiatr vs porywy | Średnia ze stacji (23 km/h) większa niż porywy z modelu (20 km/h). Stacja ma `wiatr_predkosc_maksymalna` (32,8 km/h), której nie używamy. | 23 > 20 | 🔴 |
| 3 | Opad ze stacji | Stacja może tylko zdjąć opad (L3188), nie dodać. Realny deszcz 1,2 mm/10 min nie pojawia się w UI. | −7,2 mm/h | 🔴 |
| 4 | Karta stacji: „Opad” | Czyta `suma_opadu` (L2135), Głodowo ma `opad_10min` → zawsze „0 mm”. Brak wiatru też pokazuje „0 km/h”. | – | 🔴 |
| 5 | Ikona vs opis | Stacja podmienia kod 2→3 (L3188), a opis liczy się z % chmur („Częściowe”, 60%). Ikona pokazuje ciemną, pochmurną chmurę. | – | 🔴 |
| 6 | Odczuwalna po fuzji | Inna formuła niż bez fuzji (Thom DI zamiast modelu). Średnio 3,5°C od BoM, skok 4°C na 27°C, wiatr ignorowany >10°C. Wartość zmienia znaczenie zależnie od tego, czy stacja jest w zasięgu. | ±3,5°C | 🔴/🟠 |
| 7 | Tryb offline | Chmury tylko z ICON-EU (L2904) przy średniej pozostałych pól; kod wybierany wg najwyższego PoP (L1043) → „Deszcz” z jednego modelu z 3. | 95% vs 50% | 🟠 |
| 8 | Duch opadu | Stacja ≤5 km bez opadu zeruje deszcz z modelu. Stacja to punkt, a deszcz bywa kilka km dalej; yr.no/Open-Meteo pokażą deszcz. | – | 🟠 |
| 9 | Temperatura | Stacja 3,7 km, waga 1. Różnica 1,8°C względem modelu jest realna (pomiar vs siatka 2–11 km), więc Aura będzie się różnić od serwisów bez obserwacji. | +1,8°C | 🟠 (zgodne z założeniem) |
| 10 | Godziny +1…+3 | Zanikające przesunięcie względem modelu (+1,3/+0,7/+0,3). Po 3 h zgodne z modelem. | ≤1,3°C | 🟠 |
| 11 | Max/min dnia | Podnoszone o obserwację (30° przy modelu 21°, gdy stacja 29,5°). To zgodne z rzeczywistością, ale różni się od „prognozy max”. | do +9°C | 🟡 |
| 12 | Jakość powietrza | Skala **EAQI** (Open-Meteo/CAMS) z polskimi etykietami „Dobra/Umiarkowana…”. Polski indeks GIOŚ liczy inaczej (potwierdzone: PM10 do 50 µg/m³ = „Dobry”). Ta sama liczba może dostać inną etykietę niż w GIOŚ/Airly; do EAQI dla PM10 z pamięci: „umiarkowana” już od ok. 40 µg/m³ — do potwierdzenia. | 1–2 klasy | 🟡 |
| 13 | Jakość powietrza | To model CAMS (siatka ~10 km), nie pomiar stacji GIOŚ. | – | 🟡 |
| 14 | UV | `uv_index` (z chmurami) obok `uv_index_clear_sky`. MET Norway podaje tylko bezchmurne, więc porównując z yr.no widać nawet 2× więcej. | do 2× | 🟡 |
| 15 | Zachmurzenie | Surowa wartość modelu (brak transformacji); różne modele dają 15–95% dla tej samej godziny, ale to nie błąd Aury. Opisy chmur wg innych progów niż synoptyczne oktanty. | konwencja | 🟡 |
| 16 | Opady dziś | To **prognozowana** suma dobowa z modelu, nie pomiar. Nie odzwierciedla tego, co już spadło. | – | 🟡 |
| 17 | Ciśnienie | MSL z modelu (bez stacji); zgodne z yr.no i IMGW SYNOP (też MSL). | ±1–3 hPa | 🟢 |
| 18 | Punkt rosy | Formuła Magnusa, różnica <0,04°C względem alternatyw. | <0,04°C | 🟢 |
| 19 | Beaufort | Progi zgodne z WMO. | – | 🟢 |
| 20 | Wilgotność, kierunek | Fuzja ze stacją, spójne z pomiarem. | – | 🟢 |

---

## 4. Czego nie da się rozstrzygnąć bez danych na żywo
- Realna różnica temperatury i wiatru względem yr.no, IMGW-PIB i innych serwisów dla Twojego miejsca: wymaga zapytań do ich API (skrypt niżej).
- Poprawność sunrise/sunset i pyłków: pochodzą wprost z Open-Meteo, nie są przetwarzane po stronie Aury (nie testowałem).
- Współrzędne stacji SYNOP w `IMGW_STATIONS` są przybliżone (dopasowanie po nazwie); odległość do stacji poza Głodowem może być zaniżona lub zawyżona o kilka km (wniosek z kodu, niepotwierdzony na danych).

---

## 5. Rekomendowana kolejność napraw
1. **#1 widoczność:** zamiast `10000` użyć `Math.max(10000, v)` w gałęzi `stationNoPrecip` (L2684–2686). Nie ma obserwacji widoczności, więc nie wolno jej obniżać.
2. **#3 i #4 opad ze stacji:** karta ma czytać `opad_10min`; opad ze stacji >0 powinien podnosić „teraz” do deszczu (co najmniej flaga „stacja mierzy opad”).
3. **#2 porywy:** użyć `wiatr_predkosc_maksymalna` (×3,6) jako dolnej granicy porywów oraz `gust ≥ wiatr`.
4. **#5 ikona/opis:** jedna ścieżka (kod z % chmur albo opis z kodu), żeby ikona i tekst nie rozjeżdżały się.
5. **#6 odczuwalna:** jedna formuła niezależnie od fuzji (np. BoM/Steadman lub `apparent_temperature` z modelu + korekta o różnicę T), bez skoku na 27°C.
6. **#12 jakość powietrza:** przemianować etykiety na EAQI (Dobra/Umiarkowana/Słaba…) i podpisać „skala europejska, nie polski indeks GIOŚ”.

---

## 6. Porównanie na żywo u Ciebie: `porownaj-zrodla.js`
1. Otwórz Aurę, wybierz miejsce, poczekaj na załadowanie.
2. Konsola przeglądarki (Chrome na komputerze, F12 → Console). Wklej cały plik `porownaj-zrodla.js` i naciśnij Enter.
3. Wynik: tabela z kolumnami Aura, 6 modeli Open-Meteo, MET Norway, IMGW, mediana i różnica; wiersze z różnicą powyżej progu są oznaczone ⚠. JSON trafia do schowka: wklej go do rozmowy, a zestawię różnice i wskażę, co jest błędem, a co różnicą źródeł.

Progi ostrzeżeń: temperatura 1,5°C, odczuwalna 3°C, wilgotność 10 pp, punkt rosy 2°C, wiatr 8 km/h, porywy 12 km/h, kierunek 45°, ciśnienie 3 hPa, zachmurzenie 30 pp, widoczność 5 km, UV 1,5, opad 0,3 mm, max/min 2°C.
