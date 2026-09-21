import datetime as dt
import json
import math
import re
from pathlib import Path
from urllib.parse import urlencode

import requests

LAT = 52.8142
LON = 19.21174
WMS_URL = "https://view.eumetsat.int/geoserver/wms"
LAYER = "msg_fes:clm"
OUT = Path("satellite-cloud.json")

# EUMETView exposes MSG/SEVIRI Cloud Mask without account credentials.
# The product is categorical (clear land / clear water / cloud / off-disc),
# so Aura derives a local cloud fraction only from sampled real pixels.
OFFSETS_KM = (-4.0, 0.0, 4.0)
TIMEOUT = 15


def point_query(lat, lon):
    # Small bbox around the queried point; the center pixel is requested.
    dlat = 0.015
    dlon = 0.015 / max(0.2, math.cos(math.radians(lat)))
    bbox = f"{lon-dlon},{lat-dlat},{lon+dlon},{lat+dlat}"
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetFeatureInfo",
        "LAYERS": LAYER,
        "QUERY_LAYERS": LAYER,
        "STYLES": "",
        "CRS": "EPSG:4326",
        "BBOX": bbox,
        "WIDTH": "101",
        "HEIGHT": "101",
        "I": "50",
        "J": "50",
        "INFO_FORMAT": "text/plain",
    }
    r = requests.get(WMS_URL, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    text = re.sub(r"\s+", " ", r.text).strip()
    low = text.lower()

    if "not processed" in low or "off earth" in low:
        cls = "not_processed"
    elif "clear sky over land" in low or "clear land" in low:
        cls = "clear_land"
    elif "clear sky over water" in low or "clear water" in low:
        cls = "clear_water"
    elif re.search(r"\bcloud(?:y|s)?\b", low):
        cls = "cloud"
    else:
        cls = "unknown"

    return {
        "lat": lat,
        "lon": lon,
        "class": cls,
        "raw": text[:500],
    }


def main():
    generated = dt.datetime.now(dt.timezone.utc)
    samples = []

    for dy in OFFSETS_KM:
        for dx in OFFSETS_KM:
            lat = LAT + dy / 111.0
            lon = LON + dx / (111.0 * max(0.2, math.cos(math.radians(LAT))))
            try:
                samples.append(point_query(lat, lon))
            except Exception as exc:
                samples.append({
                    "lat": lat,
                    "lon": lon,
                    "class": "error",
                    "error": str(exc)[:300],
                })

    valid = [x for x in samples if x["class"] in {"cloud", "clear_land", "clear_water"}]
    cloudy = [x for x in valid if x["class"] == "cloud"]
    clear = [x for x in valid if x["class"] in {"clear_land", "clear_water"}]

    cloud_fraction = None
    if valid:
        cloud_fraction = round(100.0 * len(cloudy) / len(valid), 1)

    result = {
        "source": "EUMETSAT EUMETView",
        "collection": "EO:EUM:DAT:MSG:CLM",
        "layer": LAYER,
        "lat": LAT,
        "lon": LON,
        "cloudFraction": cloud_fraction,
        "classification": "cloud_fraction_from_9_real_satellite_pixels",
        "sampleCount": len(valid),
        "cloudPixels": len(cloudy),
        "clearPixels": len(clear),
        "samples": samples,
        "generatedAt": generated.isoformat(),
        "status": "OK" if valid else "NO_VALID_SAMPLES",
        "note": "Cloud fraction is calculated from the categorical MSG/SEVIRI Cloud Mask samples; no model value or visual estimate is used.",
    }

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
