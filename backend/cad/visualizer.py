"""
cad/visualizer.py — DXF rendering and issue overlay engine.

Renders a DXF file to a PNG image using:
  1. ezdxf.addons.drawing (MatplotlibBackend) — primary renderer
  2. Manual matplotlib fallback — if the addon fails on certain DXF versions

Issue overlays are added as coloured markers and text annotations.

Color scheme:
  Base drawing : black lines on white
  Tower        : #FF8C00 (orange)
  Antennas     : #1E90FF (dodger blue)
  Equipment    : #32CD32 (lime green)
  Issue markers: #FF2020 (red) / #FF6B00 (orange-red) by severity
"""

import io
import math
import base64
import logging

import ezdxf
import matplotlib
matplotlib.use("Agg")  # non-interactive backend for server use
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch

logger = logging.getLogger(__name__)

# ─── Severity colours for issue markers ──────────────────────────────────────
_SEV_COLOR = {
    "Critical": "#FF2020",
    "Warning":  "#FFA500",
    "Info":     "#4FC3F7",
}
_TELECOM_COLORS = {
    "tower":     "#FF8C00",
    "antenna":   "#1E90FF",
    "equipment": "#32CD32",
    "cable":     "#DA70D6",
}


# ─── Public API ───────────────────────────────────────────────────────────────

def render_drawing(
    dxf_path: str,
    issues: list,
    drawing_data: dict | None = None,
    output_path: str | None = None,
    dpi: int = 150,
) -> str:
    """
    Render a DXF drawing with issue overlays to a Base64-encoded PNG.

    Args:
        dxf_path:     Path to the DXF file.
        issues:       List of issue dicts (e.g. from DB, for overlay).
        drawing_data: Optional pre-extracted data (for overlay hints).
        output_path:  If provided, also save the PNG to this path.
        dpi:          Render DPI (default 150).

    Returns:
        Base64-encoded PNG string (without data URI prefix).
    """
    fig, ax = plt.subplots(figsize=(16, 12), facecolor="#FAFAFA")
    ax.set_facecolor("#FAFAFA")
    ax.set_aspect("equal")

    # ── Step 1: Render base DXF ───────────────────────────────────────────────
    try:
        doc = ezdxf.readfile(dxf_path)
        _render_dxf(doc, ax)
    except Exception as e:
        logger.warning(f"DXF render failed ({e}); falling back to blank canvas")
        ax.text(0.5, 0.5, "Drawing render unavailable\n(DXF read error)",
                ha="center", va="center", transform=ax.transAxes,
                fontsize=14, color="#888", style="italic")

    # ── Step 2: Telecom overlays ──────────────────────────────────────────────
    if drawing_data:
        _add_telecom_overlays(ax, drawing_data)

    # ── Step 3: Issue markers ─────────────────────────────────────────────────
    _add_issue_overlays(ax, issues)

    # ── Step 4: Legend ────────────────────────────────────────────────────────
    _add_legend(ax)

    ax.tick_params(left=False, bottom=False, labelleft=False, labelbottom=False)
    for spine in ax.spines.values():
        spine.set_visible(False)

    plt.tight_layout(pad=0.5)

    # ── Step 5: Export ────────────────────────────────────────────────────────
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    buf.seek(0)
    img_bytes = buf.read()
    plt.close(fig)

    if output_path:
        with open(output_path, "wb") as f:
            f.write(img_bytes)

    return base64.b64encode(img_bytes).decode("utf-8")


# ─── DXF renderer ─────────────────────────────────────────────────────────────

def _render_dxf(doc, ax):
    """Try ezdxf MatplotlibBackend first; fall back to manual rendering."""
    msp = doc.modelspace()

    try:
        from ezdxf.addons.drawing import RenderEngine
        from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

        backend = MatplotlibBackend(ax)
        RenderEngine(doc).draw_layout(msp, backend)
        return
    except Exception as e:
        logger.info(f"ezdxf drawing addon failed ({e}); using manual renderer")

    # ── Manual fallback ───────────────────────────────────────────────────────
    _manual_render(ax, msp)


def _manual_render(ax, msp):
    """Manually render common DXF entity types using matplotlib."""
    for entity in msp:
        layer = entity.dxf.layer if entity.dxf.hasattr("layer") else "0"
        color = "#222222"  # default black-ish

        try:
            dxftype = entity.dxftype()

            if dxftype == "LINE":
                s, e = entity.dxf.start, entity.dxf.end
                ax.plot([s.x, e.x], [s.y, e.y], color=color, lw=0.6, alpha=0.85)

            elif dxftype == "CIRCLE":
                c, r = entity.dxf.center, entity.dxf.radius
                circle = plt.Circle((c.x, c.y), r, fill=False, edgecolor=color, lw=0.6)
                ax.add_patch(circle)

            elif dxftype == "ARC":
                c  = entity.dxf.center
                r  = entity.dxf.radius
                a1 = entity.dxf.start_angle
                a2 = entity.dxf.end_angle
                arc = mpatches.Arc((c.x, c.y), 2*r, 2*r,
                                   angle=0, theta1=a1, theta2=a2,
                                   color=color, lw=0.6)
                ax.add_patch(arc)

            elif dxftype == "LWPOLYLINE":
                pts = [(p[0], p[1]) for p in entity.get_points()]
                if pts:
                    xs = [p[0] for p in pts] + ([pts[0][0]] if entity.closed else [])
                    ys = [p[1] for p in pts] + ([pts[0][1]] if entity.closed else [])
                    ax.plot(xs, ys, color=color, lw=0.6, alpha=0.85)

            elif dxftype == "POLYLINE":
                pts = [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices]
                if pts:
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    ax.plot(xs, ys, color=color, lw=0.6, alpha=0.85)

            elif dxftype in ("TEXT", "MTEXT"):
                txt = (entity.dxf.text if dxftype == "TEXT"
                       else entity.plain_mtext() if hasattr(entity, "plain_mtext")
                       else "")
                ins = entity.dxf.insert
                h   = entity.dxf.height if entity.dxf.hasattr("height") else 8
                # Scale font size to figure inches (rough heuristic)
                ax.text(ins.x, ins.y, txt, fontsize=max(4, min(h * 0.08, 9)),
                        color="#333", va="bottom", clip_on=True)

        except Exception:
            continue


# ─── Telecom element overlays ─────────────────────────────────────────────────

def _add_telecom_overlays(ax, drawing_data: dict):
    """Add coloured highlight markers for each telecom category."""
    cats = {
        "towers":    ("tower",     "^", 120),
        "antennas":  ("antenna",   "D",  80),
        "equipment": ("equipment", "s",  80),
        "cables":    ("cable",     ".",  20),
    }
    for key, (cat, marker, size) in cats.items():
        entities = drawing_data["telecom"].get(key, [])
        color    = _TELECOM_COLORS[cat]
        for ent in entities:
            pt = (ent.get("insert") or ent.get("center") or
                  (ent["points"][0] if ent.get("points") else None))
            if pt:
                ax.scatter(pt[0], pt[1], c=color, marker=marker, s=size,
                           zorder=5, alpha=0.7, edgecolors="white", linewidths=0.5)


# ─── Issue overlays ───────────────────────────────────────────────────────────

def _add_issue_overlays(ax, issues: list):
    """Draw red markers and annotation labels for each issue."""
    if not issues:
        return

    xlims = ax.get_xlim()
    ylims = ax.get_ylim()
    x_range = xlims[1] - xlims[0]
    y_range = ylims[1] - ylims[0]

    for idx, issue in enumerate(issues):
        sev   = issue.get("severity", "Warning")
        itype = issue.get("type", "?")
        msg   = issue.get("message", "")[:60]   # truncate long messages
        color = _SEV_COLOR.get(sev, "#FF2020")

        px = issue.get("position_x", issue.get("position", [0, 0])[0] if isinstance(issue.get("position"), list) else 0)
        py = issue.get("position_y", issue.get("position", [0, 0])[1] if isinstance(issue.get("position"), list) else 0)

        # If position is 0,0 (unknown), distribute around centre
        if px == 0 and py == 0:
            angle = (idx / max(len(issues), 1)) * 2 * math.pi
            px = (xlims[0] + xlims[1]) / 2 + 0.15 * x_range * math.cos(angle)
            py = (ylims[0] + ylims[1]) / 2 + 0.15 * y_range * math.sin(angle)

        # Marker
        ax.scatter(px, py, c=color, marker="o", s=200, zorder=8,
                   edgecolors="white", linewidths=1.5, alpha=0.95)
        ax.text(px, py, str(idx + 1), color="white", fontsize=6,
                ha="center", va="center", zorder=9, fontweight="bold")

        # Annotation with leader line
        offset_x = 0.08 * x_range if idx % 2 == 0 else -0.08 * x_range
        offset_y = 0.06 * y_range + (idx % 3) * 0.04 * y_range
        ann_x, ann_y = px + offset_x, py + offset_y

        ax.annotate(
            f"[{itype}] {msg}",
            xy=(px, py),
            xytext=(ann_x, ann_y),
            fontsize=6.5,
            color=color,
            fontweight="bold",
            bbox=dict(boxstyle="round,pad=0.25", fc="white", ec=color, alpha=0.88, lw=0.8),
            arrowprops=dict(arrowstyle="-|>", color=color, lw=0.8),
            zorder=10,
            clip_on=True,
        )


# ─── Legend ───────────────────────────────────────────────────────────────────

def _add_legend(ax):
    handles = [
        mpatches.Patch(color=_TELECOM_COLORS["tower"],     label="Tower"),
        mpatches.Patch(color=_TELECOM_COLORS["antenna"],   label="Antenna"),
        mpatches.Patch(color=_TELECOM_COLORS["equipment"], label="Equipment"),
        mpatches.Patch(color=_SEV_COLOR["Critical"],       label="Critical Issue"),
        mpatches.Patch(color=_SEV_COLOR["Warning"],        label="Warning"),
        mpatches.Patch(color=_SEV_COLOR["Info"],           label="Info"),
    ]
    ax.legend(handles=handles, loc="upper right", fontsize=7,
              framealpha=0.88, fancybox=True, edgecolor="#ccc")
