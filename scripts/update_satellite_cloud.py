import datetime as dt
import json
import math
import re
from pathlib import Path
import urllib.request
import urllib.parse

LAT = 52.8142
LON = 19.21174
WMS_URL = "https://view.eumetsat.int/geoserver/wms"
LAYER = "msg_fes:clm"
OUT = Path("satellite-cloud.json")
PUBLIC_OUT = Path("public/satellite-cloud.json")

OFFSETS_KM = (-4.0, 0.0, 4.0)
TIMEOUT = 15


def point_query(lat, lon):
    dlat = 0.015
    dlon = 0.015 / max(0.2, math.cos(math.radians(lat)))
    bbox = f"{lat-dlat},{lon-dlon},{lat+dlat},{lon+dlon}"
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
        "INFO_FORMAT": "application/json",
        "TIME": (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    url = WMS_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "AuraWeather/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        text = resp.read().decode("utf-8", errors="replace")

    text_clean = re.sub(r"\s+", " ", text).strip()
    try:
        payload = json.loads(text)
    except Exception:
        payload = None

    # EUMETSAT CLM code table 4.217:
    # 0 clear water, 1 clear land, 2 cloud, 3 no data.
    def find_code(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                key_l = str(key).lower()
                if key_l in {"cloud_mask", "cloudmask", "clm"}:
                    if isinstance(value, (int, float)) and int(value) in (0, 1, 2, 3):
                        return int(value)
                    if isinstance(value, str) and re.fullmatch(r"\s*[0-3]\s*", value):
                        return int(value)
                found = find_code(value)
                if found is not None:
                    return found
        elif isinstance(obj, list):
            for item in obj:
                found = find_code(item)
                if found is not None:
                    return found
        return None

    code = find_code(payload)
    classes = {0: "clear_water", 1: "clear_land", 2: "cloud", 3: "no_data"}
    return {
        "lat": lat,
        "lon": lon,
        "class": classes.get(code, "unknown"),
        "cloudMaskCode": code,
        "raw": text_clean[:500],
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
        "classification": "cloud_fraction_from_9_real_satellite_cloud_mask_pixels",
        "cloudMaskCodes": {"0": "clear_water", "1": "clear_land", "2": "cloud", "3": "no_data"},
        "sampleCount": len(valid),
        "cloudPixels": len(cloudy),
        "clearPixels": len(clear),
        "samples": samples,
        "generatedAt": generated.isoformat(),
        "observationAt": None,
        "observationTimeStatus": "UNKNOWN_FETCH_ONLY",
        "status": "OK" if valid else "NO_VALID_SAMPLES",
        "note": "Only explicit categorical MSG/SEVIRI Cloud Mask classes are accepted. Rendered RGB values are rejected; generatedAt is fetch time, not observation time. CLM codes: 0 clear water, 1 clear land, 2 cloud, 3 no data."
    }

    content = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    OUT.write_text(content, encoding="utf-8")
    if PUBLIC_OUT.parent.exists():
        PUBLIC_OUT.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
