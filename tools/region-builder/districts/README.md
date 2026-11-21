# District borders (one-off generator)

`packages/data/content/districts.odense.geojson` is the source of truth. This folder
records how it was drawn (GDD v1.6, before Gate 3), so it can be redone with care.
Then run `pnpm region:build`.

**Method.** Each border is a path along named OpenStreetMap ways: the main railway, the
Svendborg railway, Odense Å, Ring 2 and the centre streets. A few short straight
connectors fill gaps (listed in DECISIONS D102). All lines are noded with the region bbox
and polygonized. Faces are assigned to districts by label points, which are the arena
locations plus a few extra points. Because neighbouring districts share identical edges,
there are no gaps or overlaps. `shapely.coverage_simplify` (≈1.5 m) keeps that true.

**Run** (Python 3.11 with `shapely>=2.1`):

1. Fetch the two extracts:
   ```sh
   curl --data-urlencode "data@overpass-borders.ql" https://overpass-api.de/api/interpreter -o osm.json
   curl --data-urlencode "data@overpass-streets.ql" https://overpass-api.de/api/interpreter -o osm2.json
   ```
   Send a generic User-Agent, and back off if the server is busy.
2. Merge their `elements` into one `all.json`.
3. Build:
   ```sh
   python build_districts.py all.json districts.odense.geojson
   ```

The script stops if:

- a face holds two districts' label points (a border has a gap);
- a large face has no label;
- a district is not one polygon;
- an arena falls outside its district.
