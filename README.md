# Aura Pogoda

- `index.html` – główna aplikacja (prognoza, radar, stacje IMGW, modele)
- `okno.html` – „Zza okna”: porównuje to, co widzisz, z prognozą i pomiarem IMGW
- `sw.js`, `manifest.webmanifest`, `icon-*.png` – PWA (instalacja + offline)

Wszystkie pliki muszą leżeć w tym samym folderze (GitHub Pages). Obie aplikacje
współdzielą localStorage (`okno_log`, `okno_bias`, `aura_v6`), więc muszą być
serwowane z tego samego adresu.
