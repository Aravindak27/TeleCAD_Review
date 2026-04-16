"""
cad/extractor.py — DXF geometry and entity extraction.

Parses a DXF file and returns a structured dict with:
  • All geometric entities (lines, circles, arcs, polylines)
  • Text entities and their content
  • Block inserts
  • Layer inventory
  • Drawing bounding box
  • Heuristically identified telecom elements (tower, antennas, equipment, etc.)
"""

import math
import ezdxf
from typing import Any


# ─── Telecom layer name heuristics ───────────────────────────────────────────

_TOWER_KEYWORDS     = {"tower", "tw", "monopole", "lattice", "mast", "pole"}
_ANTENNA_KEYWORDS   = {"antenna", "ant", "sector", "rru", "air", "panel"}
_MICROWAVE_KEYWORDS = {"microwave", "mw", "dish", "ptp", "backhaul", "link"}
_EQUIPMENT_KEYWORDS = {"equip", "equipment", "bts", "cabinet", "shelter",
                       "odu", "power", "battery", "rbs"}
_CABLE_KEYWORDS     = {"cable", "feeder", "rf", "fiber", "fibre", "coax",
                       "earthing", "earth", "grounding", "wiring"}
_FOUNDATION_KEYWORDS= {"foundation", "found", "base", "footing", "ground"}
_BOUNDARY_KEYWORDS  = {"boundary", "site", "fence", "perimeter", "compound"}
_NORTH_KEYWORDS     = {"north", "compass", "orientation", "direction"}
_DIMENSION_KEYWORDS = {"dim", "dimension", "measurement"}


def _layer_matches(layer_name: str, keywords: set) -> bool:
    ln = layer_name.lower().replace("-", "").replace("_", "")
    return any(kw in ln for kw in keywords)


# ─── Main extractor ───────────────────────────────────────────────────────────

def extract_drawing_data(dxf_path: str) -> dict:
    """
    Load *dxf_path* and extract a structured representation of the drawing.

    Returns a dict with keys:
        layers, bounds, entities, telecom, stats
    """
    try:
        doc = ezdxf.readfile(dxf_path)
    except Exception as e:
        return _empty_data(error=str(e))

    msp = doc.modelspace()

    data: dict[str, Any] = {
        "layers": [],
        "bounds": {"min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 800},
        "entities": {
            "lines":     [],
            "circles":   [],
            "arcs":      [],
            "polylines": [],
            "texts":     [],
            "inserts":   [],
        },
        "telecom": {
            "towers":      [],
            "antennas":    [],
            "microwave":   [],
            "equipment":   [],
            "cables":      [],
            "foundations": [],
            "boundaries":  [],
            "north":       [],
            "text_labels": [],
        },
        "stats": {
            "total_entities": 0,
            "has_tower":      False,
            "has_north":      False,
            "has_boundary":   False,
            "antenna_count":  0,
            "equipment_count":0,
        },
    }

    # ── Layer inventory ───────────────────────────────────────────────────────
    data["layers"] = [layer.dxf.name for layer in doc.layers]

    # ── Classify layers ───────────────────────────────────────────────────────
    tower_layers    = {l for l in data["layers"] if _layer_matches(l, _TOWER_KEYWORDS)}
    antenna_layers  = {l for l in data["layers"] if _layer_matches(l, _ANTENNA_KEYWORDS)}
    mw_layers       = {l for l in data["layers"] if _layer_matches(l, _MICROWAVE_KEYWORDS)}
    equip_layers    = {l for l in data["layers"] if _layer_matches(l, _EQUIPMENT_KEYWORDS)}
    cable_layers    = {l for l in data["layers"] if _layer_matches(l, _CABLE_KEYWORDS)}
    found_layers    = {l for l in data["layers"] if _layer_matches(l, _FOUNDATION_KEYWORDS)}
    boundary_layers = {l for l in data["layers"] if _layer_matches(l, _BOUNDARY_KEYWORDS)}
    north_layers    = {l for l in data["layers"] if _layer_matches(l, _NORTH_KEYWORDS)}

    # ── Entity extraction ─────────────────────────────────────────────────────
    min_x = min_y =  1e9
    max_x = max_y = -1e9

    def _upd_bounds(x, y):
        nonlocal min_x, min_y, max_x, max_y
        min_x = min(min_x, x); min_y = min(min_y, y)
        max_x = max(max_x, x); max_y = max(max_y, y)

    for entity in msp:
        dxftype   = entity.dxftype()
        layer_name = entity.dxf.layer if entity.dxf.hasattr("layer") else "0"

        try:
            if dxftype == "LINE":
                s = entity.dxf.start
                e = entity.dxf.end
                rec = {"layer": layer_name, "start": [s.x, s.y], "end": [e.x, e.y]}
                data["entities"]["lines"].append(rec)
                for pt in [s, e]:
                    _upd_bounds(pt.x, pt.y)
                _classify_entity(data, layer_name, rec, "lines",
                                 tower_layers, antenna_layers, mw_layers,
                                 equip_layers, cable_layers, found_layers,
                                 boundary_layers, north_layers)

            elif dxftype == "CIRCLE":
                c = entity.dxf.center
                r = entity.dxf.radius
                rec = {"layer": layer_name, "center": [c.x, c.y], "radius": r}
                data["entities"]["circles"].append(rec)
                _upd_bounds(c.x - r, c.y - r); _upd_bounds(c.x + r, c.y + r)
                _classify_entity(data, layer_name, rec, "circles",
                                 tower_layers, antenna_layers, mw_layers,
                                 equip_layers, cable_layers, found_layers,
                                 boundary_layers, north_layers)

            elif dxftype == "ARC":
                c = entity.dxf.center
                r = entity.dxf.radius
                rec = {"layer": layer_name,
                       "center": [c.x, c.y], "radius": r,
                       "start_angle": entity.dxf.start_angle,
                       "end_angle":   entity.dxf.end_angle}
                data["entities"]["arcs"].append(rec)
                _upd_bounds(c.x - r, c.y - r); _upd_bounds(c.x + r, c.y + r)

            elif dxftype in ("LWPOLYLINE", "POLYLINE"):
                try:
                    if dxftype == "LWPOLYLINE":
                        pts = [(p[0], p[1]) for p in entity.get_points()]
                    else:
                        pts = [(v.dxf.location.x, v.dxf.location.y)
                               for v in entity.vertices]
                    if pts:
                        rec = {"layer": layer_name, "points": pts,
                               "closed": getattr(entity, "closed", False)}
                        data["entities"]["polylines"].append(rec)
                        for px, py in pts:
                            _upd_bounds(px, py)
                        _classify_entity(data, layer_name, rec, "polylines",
                                         tower_layers, antenna_layers, mw_layers,
                                         equip_layers, cable_layers, found_layers,
                                         boundary_layers, north_layers)
                except Exception:
                    pass

            elif dxftype in ("TEXT", "MTEXT"):
                txt = (entity.dxf.text if dxftype == "TEXT"
                       else entity.plain_mtext() if hasattr(entity, "plain_mtext")
                       else entity.text)
                ins = entity.dxf.insert
                rec = {"layer": layer_name,
                       "text": txt,
                       "position": [ins.x, ins.y]}
                data["entities"]["texts"].append(rec)
                data["telecom"]["text_labels"].append(rec)
                _upd_bounds(ins.x, ins.y)

            elif dxftype == "INSERT":
                ins = entity.dxf.insert
                rec = {"layer": layer_name,
                       "name":   entity.dxf.name,
                       "insert": [ins.x, ins.y],
                       "rotation": entity.dxf.rotation if entity.dxf.hasattr("rotation") else 0}
                data["entities"]["inserts"].append(rec)
                _upd_bounds(ins.x, ins.y)
                # Classify insert by block name
                bname = entity.dxf.name.lower()
                if any(k in bname for k in _TOWER_KEYWORDS):
                    data["telecom"]["towers"].append(rec)
                elif any(k in bname for k in _ANTENNA_KEYWORDS):
                    data["telecom"]["antennas"].append(rec)
                elif any(k in bname for k in _MICROWAVE_KEYWORDS):
                    data["telecom"]["microwave"].append(rec)
                elif any(k in bname for k in _EQUIPMENT_KEYWORDS):
                    data["telecom"]["equipment"].append(rec)

        except Exception:
            continue  # Skip malformed entities gracefully

    # ── Bounding box ──────────────────────────────────────────────────────────
    if min_x < 1e9:
        padding = max((max_x - min_x) * 0.05, 50)
        data["bounds"] = {
            "min_x": min_x - padding,
            "min_y": min_y - padding,
            "max_x": max_x + padding,
            "max_y": max_y + padding,
        }

    # ── Stats ─────────────────────────────────────────────────────────────────
    data["stats"]["total_entities"] = (
        len(data["entities"]["lines"])    +
        len(data["entities"]["circles"])  +
        len(data["entities"]["arcs"])     +
        len(data["entities"]["polylines"])+
        len(data["entities"]["inserts"])
    )
    data["stats"]["has_tower"]      = bool(data["telecom"]["towers"])
    data["stats"]["has_north"]      = bool(data["telecom"]["north"])
    data["stats"]["has_boundary"]   = bool(data["telecom"]["boundaries"])
    data["stats"]["antenna_count"]  = len(data["telecom"]["antennas"])
    data["stats"]["equipment_count"]= len(data["telecom"]["equipment"])

    return data


# ─── Entity classifier ────────────────────────────────────────────────────────

def _classify_entity(data, layer_name, rec, entity_type,
                     tower_layers, antenna_layers, mw_layers,
                     equip_layers, cable_layers, found_layers,
                     boundary_layers, north_layers):
    """Append entity record to the appropriate telecom category."""
    if layer_name in tower_layers:
        data["telecom"]["towers"].append({**rec, "_entity_type": entity_type})
    elif layer_name in antenna_layers:
        data["telecom"]["antennas"].append({**rec, "_entity_type": entity_type})
    elif layer_name in mw_layers:
        data["telecom"]["microwave"].append({**rec, "_entity_type": entity_type})
    elif layer_name in equip_layers:
        data["telecom"]["equipment"].append({**rec, "_entity_type": entity_type})
    elif layer_name in cable_layers:
        data["telecom"]["cables"].append({**rec, "_entity_type": entity_type})
    elif layer_name in found_layers:
        data["telecom"]["foundations"].append({**rec, "_entity_type": entity_type})
    elif layer_name in boundary_layers:
        data["telecom"]["boundaries"].append({**rec, "_entity_type": entity_type})
    elif layer_name in north_layers:
        data["telecom"]["north"].append({**rec, "_entity_type": entity_type})


def _empty_data(error: str = "") -> dict:
    return {
        "layers":   [],
        "bounds":   {"min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 800},
        "entities": {"lines": [], "circles": [], "arcs": [],
                     "polylines": [], "texts": [], "inserts": []},
        "telecom":  {"towers": [], "antennas": [], "microwave": [],
                     "equipment": [], "cables": [], "foundations": [],
                     "boundaries": [], "north": [], "text_labels": []},
        "stats":    {"total_entities": 0, "has_tower": False, "has_north": False,
                     "has_boundary": False, "antenna_count": 0, "equipment_count": 0,
                     "error": error},
    }


# ─── Azimuth calculation helper ───────────────────────────────────────────────

def calculate_azimuths(antennas: list) -> list[float]:
    """
    Estimate azimuths of antennas relative to a common origin.
    Expects each antenna to have an 'insert' or 'center' key with [x, y].
    """
    positions = []
    for ant in antennas:
        pt = ant.get("insert") or ant.get("center") or ant.get("start")
        if pt:
            positions.append(pt)

    if len(positions) < 2:
        return []

    # Centre of mass as rough tower position
    cx = sum(p[0] for p in positions) / len(positions)
    cy = sum(p[1] for p in positions) / len(positions)

    azimuths = []
    for px, py in positions:
        dx, dy = px - cx, py - cy
        az = (math.degrees(math.atan2(dx, dy)) + 360) % 360
        azimuths.append(az)

    return sorted(azimuths)
