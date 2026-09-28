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
# EUMETView/CLM can lag behind the wall clock. Try the latest completed
# quarter-hour and walk backwards until a real product is available.
MAX_LOOKBACK_SLOTS = 8


def point_query(lat, lon, observation_time):
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
        "TIME": observation_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
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
    if payload is None:
        payload = {}

    def extract_rgb_from_text(value):
        m = re.search(
            r'"?RED_BAND"?\s*[:=]\s*([0-9.]+).*?'
            r'"?GREEN_BAND"?\s*[:=]\s*([0-9.]+).*?'
            r'"?BLUE_BAND"?\s*[:=]\s*([0-9.]+)',
            value, re.I | re.S,
        )
        if not m:
            return None
        try:
            return tuple(int(round(float(x))) for x in m.groups())
        except Exception:
            return None

    def rgb(obj):
        if not isinstance(obj, dict):
            return None
        try:
            return tuple(int(round(float(obj[k]))) for k in ("RED_BAND", "GREEN_BAND", "BLUE_BAND"))
        except Exception:
            return None

    def collect_rgb(obj, out):
        if isinstance(obj, dict):
            r = rgb(obj)
            if r is not None:
                out.append(r)
            for value in obj.values():
                collect_rgb(value, out)
        elif isinstance(obj, list):
            for item in obj:
                collect_rgb(item, out)

    rgbs = []
    collect_rgb(payload, rgbs)
    text_rgb = extract_rgb_from_text(text)
    if text_rgb is not None and text_rgb not in rgbs:
        rgbs.append(text_rgb)

    palette = {
        "clear_land": (0, 192, 0),
        "clear_water": (0, 0, 192),
        "cloud": (255, 255, 255),
        "no_data": (0, 0, 0),
    }

    def classify_rgb(colour):
        if colour is None:
            return "unknown"
        best_name = "unknown"
        best_dist = 10**9
        for name, ref in palette.items():
            dist = sum(abs(colour[i] - ref[i]) for i in range(3))
            if dist < best_dist:
                best_dist = dist
                best_name = name
        return best_name if best_dist <= 6 else "unknown"

    classes = {0: "clear_water", 1: "clear_land", 2: "cloud", 3: "no_data"}
    class_name = next((classify_rgb(x) for x in rgbs if classify_rgb(x) != "unknown"), "unknown")
    code = next((k for k, v in classes.items() if v == class_name), None)

    return {
        "lat": lat,
        "lon": lon,
        "class": classes.get(code, "unknown"),
        "cloudMaskCode": code,
        "rgb": rgbs[0] if rgbs else None,
        "raw": text_clean[:500],
    }


def query_slot(observation):
    samples = []
    for dy in OFFSETS_KM:
        for dx in OFFSETS_KM:
            lat = LAT + dy / 111.0
            lon = LON + dx / (111.0 * max(0.2, math.cos(math.radians(LAT))))
            try:
                samples.append(point_query(lat, lon, observation))
            except Exception as exc:
                samples.append({
                    "lat": lat,
                    "lon": lon,
                    "class": "error",
                    "error": str(exc)[:300],
                })
    return samples


def main():
    generated = dt.datetime.now(dt.timezone.utc)
    base = generated.replace(second=0, microsecond=0)
    base -= dt.timedelta(minutes=base.minute % 15)

    selected_observation = None
    selected_samples = None
    selected_valid = []
    attempts = []

    for slot in range(MAX_LOOKBACK_SLOTS + 1):
        observation = base - dt.timedelta(minutes=15 * slot)
        samples = query_slot(observation)
        valid = [x for x in samples if x["class"] in {"cloud", "clear_land", "clear_water"}]
        attempts.append({
            "observationAt": observation.isoformat().replace("+00:00", "Z"),
            "sampleCount": len(valid),
        })
        if valid:
            selected_observation = observation
            selected_samples = samples
            selected_valid = valid
            break

    samples = selected_samples if selected_samples is not None else [
        {"lat": LAT, "lon": LON, "class": "error", "error": "No valid CLM product in lookback window"}
    ]
    valid = selected_valid
    cloudy = [x for x in valid if x["class"] == "cloud"]
    clear = [x for x in valid if x["class"] in {"clear_land", "clear_water"}]

    cloud_fraction = round(100.0 * len(cloudy) / len(valid), 1) if valid else None
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
        "observationAt": selected_observation.isoformat().replace("+00:00", "Z") if selected_observation else None,
        "observationTimeStatus": "LATEST_AVAILABLE_CLM_PRODUCT" if selected_observation else "NO_CLM_PRODUCT_AVAILABLE",
        "lookbackAttempts": attempts,
        "status": "OK" if valid else "NO_VALID_SAMPLES",
        "note": "Queries the latest completed 15-minute EUMETSAT CLM product and walks backwards when the newest slot is not yet available. generatedAt is fetch time; observationAt is the actual CLM product time used."
    }

    content = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    OUT.write_text(content, encoding="utf-8")
    if PUBLIC_OUT.parent.exists():
        PUBLIC_OUT.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
