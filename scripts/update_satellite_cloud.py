import datetime as dt
import json
import os
import shutil
import sys
from pathlib import Path

import eumdac
from eccodes import (
    codes_grib_find_nearest,
    codes_grib_new_from_file,
    codes_get,
    codes_release,
)

LAT = 52.8142
LON = 19.21174
COLLECTION = "EO:EUM:DAT:MSG:CLM"
OUT = Path("satellite-cloud.json")
TMP = Path("satellite-cloud-download")


def main():
    key = os.environ.get("EUMETSAT_CONSUMER_KEY")
    secret = os.environ.get("EUMETSAT_CONSUMER_SECRET")
    if not key or not secret:
        raise SystemExit("Missing EUMETSAT_CONSUMER_KEY/EUMETSAT_CONSUMER_SECRET")

    token = eumdac.AccessToken((key, secret))
    store = eumdac.DataStore(token)
    collection = store.get_collection(COLLECTION)

    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(hours=2)
    products = collection.search(dtstart=start, dtend=end)
    products = list(products)
    if not products:
        raise SystemExit("No recent MSG Cloud Mask product found")

    product = products[0]
    TMP.mkdir(exist_ok=True)
    with product.open() as src:
        target = TMP / Path(src.name).name
        with target.open("wb") as dst:
            shutil.copyfileobj(src, dst)

    gid = None
    try:
        with target.open("rb") as fh:
            gid = codes_grib_new_from_file(fh)
            if gid is None:
                raise SystemExit("Downloaded product contains no GRIB message")

            nearest = codes_grib_find_nearest(gid, LAT, LON, is_lsm=False, npoints=4)
            values = [float(x.value) for x in nearest]
            points = [
                {
                    "lat": float(x.lat),
                    "lon": float(x.lon),
                    "value": float(x.value),
                    "distanceKm": float(x.distance),
                    "index": int(x.index),
                }
                for x in nearest
            ]
            result = {
                "source": "EUMETSAT",
                "collection": COLLECTION,
                "productId": str(product),
                "sensingStart": getattr(product, "sensing_start", None).isoformat() if getattr(product, "sensing_start", None) else None,
                "sensingEnd": getattr(product, "sensing_end", None).isoformat() if getattr(product, "sensing_end", None) else None,
                "lat": LAT,
                "lon": LON,
                "parameter": codes_get(gid, "name") if "name" in [] else "MSGCLMK",
                "nearestValues": values,
                "nearestPoints": points,
                "cloudFraction": None,
                "status": "RAW_MASK_READY",
                "note": "MSG/SEVIRI Cloud Mask is a categorical pixel mask; no percentage is inferred here.",
                "generatedAt": end.isoformat(),
            }
    finally:
        if gid is not None:
            codes_release(gid)

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
