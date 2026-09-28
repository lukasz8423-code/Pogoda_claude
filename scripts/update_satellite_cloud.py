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

    # EUMETView exposes the official categorical CLM layer.
    # Accept only the known categorical palette; arbitrary RGB imagery is rejected.
    def rgb(obj):
        if not isinstance(obj, dict):
            return None
        try:
            return tuple(int(round(float(obj[k]))) for k in ("RED_BAND","GREEN_BAND","BLUE_BAND"))
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

def main():
    generated = dt.datetime.now(dt.timezone.utc)
    observation = generated.replace(second=0, microsecond=0)
    observation -= dt.timedelta(minutes=observation.minute % 15)
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
        "observationAt": observation.isoformat().replace("+00:00", "Z"),
        "observationTimeStatus": "REQUESTED_CLM_PRODUCT_TIME",
        "status": "OK" if valid else "NO_VALID_SAMPLES",
        "note": "EUMETView msg_fes:clm is the official EUMETSAT Cloud Mask WMS layer. Samples are accepted only when the categorical palette matches a CLM class. observationAt is the completed 15-minute CLM product time requested from EUMETSAT; generatedAt is fetch time. CLM codes: 0 clear water, 1 clear land, 2 cloud, 3 no data."
    }

    content = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    OUT.write_text(content, encoding="utf-8")
    if PUBLIC_OUT.parent.exists():
        PUBLIC_OUT.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
