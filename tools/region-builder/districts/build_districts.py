"""Builds the 8 Odense districts from real borders (OSM roads, railway, Odense Å).

Each border is a path along named OSM ways (or a short connector). All lines are noded
together with the region bbox and polygonized; faces are assigned to districts by label
points, so neighbouring districts share identical edges (no gaps, no overlaps).

usage: python build_districts.py all.json out.geojson
"""
import heapq, json, math, sys
from collections import defaultdict
import shapely
from shapely.geometry import LineString, Point, Polygon, box, mapping
from shapely.ops import polygonize, unary_union

SRC, OUT = sys.argv[1], sys.argv[2]
BBOX = (10.30, 55.35, 10.47, 55.43)
LEVELS = {1: [3, 8], 2: [8, 14], 3: [13, 20], 4: [19, 26], 5: [25, 32], 6: [31, 38], 7: [37, 44], 8: [43, 50]}
# Arena locations (GDD "World" table), from OSM: [lng, lat]
ARENAS = {
    1: (10.38522, 55.39978),  # Kongens Have (arena 1 POI)
    2: (10.38331, 55.39077),  # Munke Mose (park centroid)
    3: (10.39069, 55.39840),  # H.C. Andersens Hus
    4: (10.38897, 55.39541),  # Sankt Knuds Kirke / Skt. Knuds Plads
    5: (10.38249, 55.40698),  # Odense Havnebad
    6: (10.37220, 55.37120),  # Fruens Bøge forest, west of the Svendborg railway
    7: (10.37357, 55.37713),  # Odense Zoo
    8: (10.38348, 55.36535),  # Den Fynske Landsby
}
# Extra label points for faces without an arena.
LABELS = {4: [(10.405, 55.388)], 5: [(10.40, 55.42)], 6: [(10.32, 55.36), (10.3554, 55.3866)], 2: [(10.35747, 55.39212)], 8: [(10.44, 55.37)]}

M_LAT = 111_320.0
M_LNG = 111_320.0 * math.cos(math.radians(55.39))


def dist(a, b):
    return math.hypot((a[0] - b[0]) * M_LNG, (a[1] - b[1]) * M_LAT)


els = json.load(open(SRC, encoding='utf8'))['elements']
ways = [e for e in els if e['type'] == 'way' and e.get('geometry')]


def key(p):
    # ~1 m grid: joins pieces of a street whose ends almost touch
    return (round(p['lon'], 5), round(p['lat'], 5))


def graph(pred):
    g = defaultdict(list)
    for w in ways:
        if not pred(w.get('tags', {})):
            continue
        pts = [key(p) for p in w['geometry']]
        for a, b in zip(pts, pts[1:]):
            d = dist(a, b)
            g[a].append((b, d))
            g[b].append((a, d))
    if not g:
        raise SystemExit('empty graph')
    # Bridge street ends that stop just short of the next piece (dual carriageways,
    # split ways): link each dead end to the nearest other node within 25 m.
    ends = [n for n, e in g.items() if len(e) == 1]
    for n in ends:
        cands = [m for m in g if m != n and m not in {x for x, _ in g[n]} and dist(n, m) <= 25]
        if cands:
            m = min(cands, key=lambda m: dist(n, m))
            g[n].append((m, dist(n, m)))
            g[m].append((n, dist(n, m)))
    return g


def nearest(g, p):
    return min(g, key=lambda n: dist(n, p))


def route(g, a, b, label):
    s, t = nearest(g, a), nearest(g, b)
    for want, got in ((a, s), (b, t)):
        if dist(want, got) > 60:
            print(f'  ! {label}: snapped {dist(want, got):.0f} m from {want}')
    best = {s: 0.0}
    prev = {}
    q = [(0.0, s)]
    while q:
        d, n = heapq.heappop(q)
        if n == t:
            break
        if d > best.get(n, 1e18):
            continue
        for m, w in g[n]:
            nd = d + w
            if nd < best.get(m, 1e18):
                best[m] = nd
                prev[m] = n
                heapq.heappush(q, (nd, m))
    if t not in best:
        raise SystemExit(f'{label}: no path')
    path = [t]
    while path[-1] != s:
        path.append(prev[path[-1]])
    path.reverse()
    print(f'  {label}: {best[t]:.0f} m, {len(path)} points')
    return path


def names(*ns):
    return lambda t: t.get('name') in ns and 'highway' in t


RAILG = graph(lambda t: t.get('railway') == 'rail')
RIVERG = graph(lambda t: t.get('waterway') == 'river' and t.get('name') == 'Odense Å')


def extend(path, metres):
    """Extends both ends straight on, so T-junctions cross their target line."""
    def ext(a, b):
        d = dist(a, b) or 1
        k = metres / d
        return (b[0] + (b[0] - a[0]) * k, b[1] + (b[1] - a[1]) * k)
    return [ext(path[1], path[0])] + path + [ext(path[-2], path[-1])]


lines = {}


def add(name, path, overshoot=12):
    lines[name] = LineString(extend(path, overshoot) if overshoot else path)


print('borders:')


def route_to_line(g, a, target, label):
    """Shortest path from a to any vertex of an existing path (so it starts ON that line)."""
    tset = {t for t in target if t in g}
    s = nearest(g, a)
    best = {s: 0.0}; prev = {}; q = [(0.0, s)]; hit = None
    while q:
        d, n = heapq.heappop(q)
        if n in tset:
            hit = n; break
        if d > best.get(n, 1e18):
            continue
        for m, w in g[n]:
            nd = d + w
            if nd < best.get(m, 1e18):
                best[m] = nd; prev[m] = n; heapq.heappush(q, (nd, m))
    if hit is None:
        raise SystemExit(f'{label}: does not reach the target line')
    path = [hit]
    while path[-1] != s:
        path.append(prev[path[-1]])
    print(f'  {label}: {best[hit]:.0f} m, {len(path)} points, joins at {hit}')
    return path  # starts on the target line


def nearest_vertex(path, p):
    return min(path, key=lambda q: dist(q, p))


rail = route(RAILG, (10.2900, 55.3700), (10.4800, 55.3830), 'main railway')
print('   rail ends', rail[0], rail[-1])
add('rail', rail, 0)
svb = route(RAILG, (10.4050, 55.3450), (10.3575, 55.3935), 'Svendborg railway')
print('   svb ends', svb[0], svb[-1], 'gap to main line', round(min(dist(svb[-1], r) for r in rail)), 'm')
add('svb', svb + [nearest_vertex(rail, svb[-1])], 0)
# District 1 west: Jarlsberggade from north of the railway down to where it turns west,
# then connectors along the old district line (west of Kongensgade, where trainer_niels
# stands) to Pantheonsgade, and Pantheonsgade to Vestergade.
jar = route(graph(names('Jarlsberggade')), (10.37828, 55.40302), (10.37808, 55.40091), 'Jarlsberggade')
add('jarls', jar, 15)
add('d1w', [jar[-1], (10.37909, 55.39896), (10.37876, 55.39587)], 0)
pan = route(graph(names('Pantheonsgade')), (10.37876, 55.39587), (10.38098, 55.39421), 'Pantheonsgade')
add('panth', pan, 12)
# District 1 east: Nørregade from north of the railway to its south end, then a connector
# to the Vestergade/Overgade corner.
nor = route(graph(names('Nørregade')), (10.38933, 55.40096), (10.38902, 55.39751), 'Nørregade')
rv = nearest_vertex(rail, (10.3895, 55.4020))
add('norre', [rv, nor[0]] + nor + [(10.38945, 55.39672)], 0)
add('norre-n', [rv, (rv[0], rv[1] + 0.0003)], 0)  # tiny overshoot north of the rail
# Vestergade + Vesterbro from the corner west to Ansgargade, Ansgargade + Kirkegårds Allé
# south to the river.
# (Vestergade's last 180 m to Ansgargade is a connector: that bit isn't in the extract.)
ves = route(graph(names('Vestergade')), (10.38945, 55.39672), (10.37955, 55.39376), 'Vestergade')
add('vester', ves + [(10.37668, 55.39390)], 0)
ans = route(graph(names('Ansgargade', 'Kirkegårds Allé')), (10.37668, 55.39390), (10.37926, 55.39216), 'Ansgargade')
river = route(RIVERG, (10.3805, 55.3923), (10.4070, 55.3963), 'Odense Å')
add('ansgar', [(10.37668, 55.39390)] + ans + [nearest_vertex(river, ans[-1])], 0)
add('river', river, 15)
# Overgade east from the corner, then a connector down to the river.
ov = route(graph(names('Overgade')), (10.38945, 55.39672), (10.39684, 55.39835), 'Overgade')
add('overgade', [(10.38945, 55.39672)] + ov + [nearest_vertex(river, ov[-1])], 0)
# Palnatokesvej north from the river, then Grønlandsgade across the railway.
pal = route(graph(names('Palnatokesvej', 'Grønlandsgade')), (10.40582, 55.39687), (10.40002, 55.40362), 'Palnatokesvej + Grønlandsgade')
add('palna', [nearest_vertex(river, pal[0])] + pal, 0)
# Hunderupvej (+ Klaregade) from the river down to Skovalléen.
hun = route(graph(names('Hunderupvej', 'Klaregade')), (10.38669, 55.39300), (10.38448, 55.37149), 'Hunderupvej')
skov = route(graph(names('Skovalléen')), (10.38451, 55.37081), (10.37280, 55.36742), 'Skovalléen')
add('hunderup', [nearest_vertex(river, hun[0])] + hun + [skov[0]], 0)
add('skov', skov, 0)
# Ring 2 south: Kløvermosevej, Tietgens Allé, Hunderupgade, Munkerisvej, then Ørbækvej
# up to Ejbygade.
ring = route(graph(names('Kløvermosevej', 'Tietgens Allé', 'Hunderupgade', 'Munkerisvej', 'Ørbækvej')), (10.3520, 55.3893), (10.42218, 55.39301), 'Ring 2 south')
print('   ring ends', ring[0], ring[-1])
add('ring', ring, 30)
# Ejbygade from Munkerisvej north across the railway.
ej = route(graph(names('Ejbygade')), (10.42218, 55.39301), (10.42548, 55.40066), 'Ejbygade')
add('ejby', [ring[-1]] + ej, 20)

frame = box(*BBOX)
noded = unary_union([*lines.values(), frame.exterior])
faces = [f for f in polygonize(noded) if frame.contains(f.representative_point())]
print(f'{len(faces)} faces')

labels = {d: [ARENAS[d]] + LABELS.get(d, []) for d in ARENAS}
owner = {}
for i, f in enumerate(faces):
    hits = {d for d, pts in labels.items() for p in pts if f.contains(Point(p))}
    if len(hits) > 1:
        raise SystemExit(f'face {i} holds several districts: {hits} (a border has a gap)')
    if hits:
        owner[i] = hits.pop()
# Unlabelled faces: tiny slivers join the neighbour with the longest shared edge;
# anything big must get a label.
for i, f in enumerate(faces):
    if i in owner:
        continue
    area = f.area * M_LAT * M_LNG
    best, shared = None, 0.0
    for j, g in enumerate(faces):
        if j in owner and f.touches(g):
            s = f.boundary.intersection(g.boundary).length
            if s > shared:
                best, shared = owner[j], s
    rp = f.representative_point()
    print(f'  unlabelled face {area:.0f} m² at {rp.x:.5f},{rp.y:.5f} → district {best}')
    if area > 20_000 or best is None:
        raise SystemExit('large unlabelled face: add a label point')
    owner[i] = best

districts = {}
for d in ARENAS:
    parts = [faces[i] for i, o in owner.items() if o == d]
    u = unary_union(parts)
    if u.geom_type != 'Polygon':
        raise SystemExit(f'district {d} is not one polygon: {u.geom_type}')
    districts[d] = u

# Simplify shared borders consistently (~1.5 m), then check the coverage.
order = sorted(districts)
simple = shapely.coverage_simplify([districts[d] for d in order], tolerance=0.00002)
simple = [shapely.set_precision(g, 1e-6) for g in simple]
union = unary_union(simple)
gap = frame.area - union.area
overlap = sum(g.area for g in simple) - union.area
print(f'gap {gap * M_LAT * M_LNG:.1f} m², overlap {overlap * M_LAT * M_LNG:.1f} m²')
for d, g in zip(order, simple):
    assert g.geom_type == 'Polygon' and g.is_valid, d
    assert g.contains(Point(ARENAS[d])), f'arena {d} outside its district'

features = []
for d, g in zip(order, simple):
    features.append({
        'type': 'Feature',
        'properties': {'id': d, 'wildLevels': LEVELS[d], 'draft': False},
        'geometry': mapping(g),
    })
    print(f'district {d}: {g.area * M_LAT * M_LNG / 1e6:.2f} km², {len(g.exterior.coords)} points')
fc = {'type': 'FeatureCollection', 'features': features}
json.dump(fc, open(OUT, 'w', encoding='utf8', newline='\n'), ensure_ascii=False, separators=(',', ':'))
print('wrote', OUT)
