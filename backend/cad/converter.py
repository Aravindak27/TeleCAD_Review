"""
cad/converter.py — DWG→DXF conversion and file validation.

Supports:
  • .dxf files — validated and passed through directly
  • .dwg files — converted via ODA File Converter (if installed)
  • Demo mode  — generates a synthetic 3-sector telecom site DXF

ODA File Converter path is read from the environment variable:
    ODA_CONVERTER_PATH  (default: searches common Windows install locations)

ODA CLI usage (called internally):
    ODAFileConverter.exe <in_dir> <out_dir> ACAD2018 DXF 0 1
"""

import os
import math
import shutil
import tempfile
import subprocess

import ezdxf
from ezdxf import colors


# ─── ODA path detection ───────────────────────────────────────────────────────

# Common Windows install locations across ODA versions
_ODA_SEARCH_PATHS = [
    r"C:\Program Files\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe",  # confirmed installed
    r"C:\Program Files\ODA\ODAFileConverter 27.1\ODAFileConverter.exe",
    r"C:\Program Files\ODA\ODAFileConverter 27.2.0\ODAFileConverter.exe",
    r"C:\Program Files\ODA\ODAFileConverter 27.2\ODAFileConverter.exe",
    r"C:\Program Files\ODA\ODAFileConverter 27.0\ODAFileConverter.exe",
    r"C:\Program Files\ODA\ODAFileConverter 26.12\ODAFileConverter.exe",
    r"C:\Program Files\ODA\ODAFileConverter 26.9\ODAFileConverter.exe",
    r"C:\Program Files\ODA\ODAFileConverter 25.12\ODAFileConverter.exe",
    r"C:\Program Files (x86)\ODA\ODAFileConverter\ODAFileConverter.exe",
    r"C:\Program Files\ODA File Converter\ODAFileConverter.exe",
]


def _find_oda_converter() -> str | None:
    """
    Return the path to ODAFileConverter.exe, or None if not found.
    Priority: ODA_CONVERTER_PATH env var → common install paths → PATH.
    """
    # 1. Explicit env variable (highest priority)
    env_path = os.getenv("ODA_CONVERTER_PATH", "").strip()
    if env_path and os.path.isfile(env_path):
        return env_path

    # 2. Scan common install directories
    for path in _ODA_SEARCH_PATHS:
        if os.path.isfile(path):
            return path

    # 3. Try to find it on system PATH
    try:
        result = subprocess.run(
            ["where", "ODAFileConverter"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            exe = result.stdout.strip().splitlines()[0]
            if os.path.isfile(exe):
                return exe
    except Exception:
        pass

    return None


def oda_available() -> bool:
    """Return True if ODA File Converter is installed and accessible."""
    return _find_oda_converter() is not None


# ─── DWG → DXF conversion ────────────────────────────────────────────────────

def convert_dwg_to_dxf(dwg_path: str, dxf_output_path: str) -> str:
    """
    Convert a DWG file to DXF using ODA File Converter.

    ODA works on directories, so we:
      1. Copy the DWG into a temp input directory
      2. Run ODA to write DXF into a temp output directory
      3. Move the result to dxf_output_path

    Args:
        dwg_path:       Absolute path to the source .dwg file.
        dxf_output_path: Destination .dxf file path.

    Returns:
        dxf_output_path on success.

    Raises:
        RuntimeError: If ODA is not installed or conversion fails.
        ValueError:   If the converted DXF cannot be read by ezdxf.
    """
    oda_exe = _find_oda_converter()
    if not oda_exe:
        raise RuntimeError(
            "ODA File Converter is not installed. "
            "Download it free from: https://www.opendesign.com/guestfiles/oda_file_converter\n"
            "Then set ODA_CONVERTER_PATH in your .env file."
        )

    with tempfile.TemporaryDirectory() as tmp_in, \
         tempfile.TemporaryDirectory() as tmp_out:

        # Copy DWG into temp input folder
        fn        = os.path.basename(dwg_path)
        tmp_dwg   = os.path.join(tmp_in, fn)
        shutil.copy2(dwg_path, tmp_dwg)

        # Build ODA CLI command:
        # ODAFileConverter <in_dir> <out_dir> <out_version> <out_type> <recurse> <audit>
        cmd = [
            oda_exe,
            tmp_in,       # source directory
            tmp_out,      # output directory
            "ACAD2018",   # output DWG/DXF version
            "DXF",        # output format
            "0",          # don't recurse sub-directories
            "1",          # audit/repair on load
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,       # 2-minute timeout for large files
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("ODA File Converter timed out after 120 seconds.")
        except Exception as e:
            raise RuntimeError(f"Failed to launch ODA File Converter: {e}")

        # ODA exits 0 on success; 1 may indicate partial success.
        # We attempt to locate the output DXF regardless, but still surface logs when failing.
        if result.returncode not in (0, 1):
            raise RuntimeError(
                f"ODA File Converter failed (exit {result.returncode}).\n"
                f"stdout: {result.stdout[:800]}\n"
                f"stderr: {result.stderr[:800]}"
            )

        # Find the generated .dxf in the output directory.
        # Note: ODA sometimes creates nested folders under the output directory.
        stem         = os.path.splitext(fn)[0]
        expected_dxf = os.path.join(tmp_out, stem + ".dxf")

        if not os.path.isfile(expected_dxf):
            # Try case-insensitive search in root first
            for f in os.listdir(tmp_out):
                if f.lower().endswith(".dxf"):
                    expected_dxf = os.path.join(tmp_out, f)
                    break

        if not os.path.isfile(expected_dxf):
            # Recursive search in case ODA nested output
            found = None
            for root, _dirs, files in os.walk(tmp_out):
                for f in files:
                    if f.lower().endswith(".dxf"):
                        found = os.path.join(root, f)
                        break
                if found:
                    break
            if found:
                expected_dxf = found
            else:
                raise RuntimeError(
                    "ODA File Converter ran but produced no DXF output.\n"
                    "Possible causes: unsupported/corrupt DWG, password-protected DWG, or ODA failed to write output.\n"
                    f"stdout: {result.stdout[:800]}\n"
                    f"stderr: {result.stderr[:800]}"
                )

        # Validate the DXF with ezdxf before moving it
        try:
            ezdxf.readfile(expected_dxf)
        except Exception as e:
            raise ValueError(f"ODA-converted DXF cannot be read by ezdxf: {e}")

        # Move to final destination
        shutil.move(expected_dxf, dxf_output_path)

    return dxf_output_path


# ─── Main entry point ─────────────────────────────────────────────────────────

def prepare_dxf(upload_path: str, dxf_output_path: str) -> str:
    """
    Prepare a DXF file for the processing pipeline.

    • .dxf → validate with ezdxf, copy to dxf_output_path
    • .dwg → convert via ODA File Converter to dxf_output_path

    Args:
        upload_path:     Absolute path to the uploaded file.
        dxf_output_path: Where to write the ready-to-process DXF.

    Returns:
        dxf_output_path

    Raises:
        ValueError:  Unsupported format or invalid DXF content.
        RuntimeError: ODA not installed (when .dwg supplied).
    """
    ext = os.path.splitext(upload_path)[1].lower()

    if ext == ".dwg":
        return convert_dwg_to_dxf(upload_path, dxf_output_path)

    if ext == ".dxf":
        try:
            ezdxf.readfile(upload_path)   # validate
        except Exception as e:
            raise ValueError(f"Invalid or corrupt DXF file: {e}")
        shutil.copy2(upload_path, dxf_output_path)
        return dxf_output_path

    raise ValueError(
        f"Unsupported file format '{ext}'. "
        "Please upload a .dxf file, or a .dwg file (requires ODA File Converter)."
    )


# ─── Demo DXF generator ───────────────────────────────────────────────────────

def generate_demo_dxf(output_path: str) -> str:
    """
    Generate a synthetic telecom site DXF for demonstration/testing.

    Drawing includes:
      • Site boundary rectangle
      • 40 m monopole tower at centre
      • 3-sector antennas at 0°, 120°, 240° azimuth
      • BTS cabinet + unlabelled power cabinet (intentional error)
      • Feeder cable runs
      • North indicator and title annotations
    """
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()

    # ── Layers ──────────────────────────────────────────────────────────────
    _add_layer(doc, "SITE_BOUNDARY", colors.CYAN)
    _add_layer(doc, "TOWER",         colors.YELLOW)
    _add_layer(doc, "ANTENNA",       colors.BLUE)
    _add_layer(doc, "EQUIPMENT",     colors.GREEN)
    _add_layer(doc, "CABLE",         colors.MAGENTA)
    _add_layer(doc, "DIMENSION",     colors.GRAY)
    _add_layer(doc, "TEXT",          colors.WHITE)
    _add_layer(doc, "NORTH",         colors.RED)

    cx, cy = 500.0, 400.0   # Site centre

    # ── Site boundary ────────────────────────────────────────────────────────
    msp.add_lwpolyline(
        [(100, 50), (900, 50), (900, 750), (100, 750), (100, 50)],
        dxfattribs={"layer": "SITE_BOUNDARY", "closed": True},
    )
    msp.add_text(
        "TELECOM SITE — REF: TS-2024-001",
        dxfattribs={"layer": "TEXT", "height": 12, "insert": (150, 770)},
    )

    # ── Tower (40 m monopole) ────────────────────────────────────────────────
    tower_height = 400   # 1 unit = 0.1 m → 40 m = 400 units
    msp.add_line((cx, cy), (cx, cy + tower_height),
                 dxfattribs={"layer": "TOWER", "lineweight": 50})

    # Platform rings every 10 m
    for h_frac in [0.25, 0.5, 0.75, 1.0]:
        h = cy + tower_height * h_frac
        r = 8 * (1 - h_frac * 0.3)
        msp.add_circle((cx, h), r, dxfattribs={"layer": "TOWER"})

    # Tower base
    msp.add_lwpolyline(
        [(cx - 15, cy), (cx + 15, cy), (cx + 15, cy - 20), (cx - 15, cy - 20)],
        dxfattribs={"layer": "TOWER", "closed": True},
    )
    msp.add_text(
        "MONOPOLE H=40m",
        dxfattribs={"layer": "TEXT", "height": 10, "insert": (cx + 20, cy + 50)},
    )

    # ── Antennas (3-sector) ──────────────────────────────────────────────────
    antenna_h       = cy + tower_height
    sector_azimuths = [0, 120, 240]

    for az in sector_azimuths:
        rad     = math.radians(90 - az)
        arm_len = 30
        ax_     = cx + arm_len * math.cos(rad)
        ay_     = antenna_h + arm_len * math.sin(rad)

        msp.add_line((cx, antenna_h), (ax_, ay_), dxfattribs={"layer": "ANTENNA"})

        perp = math.radians(90 - az + 90)
        w, l = 6, 20
        p1   = (ax_ + w * math.cos(perp), ay_ + w * math.sin(perp))
        p2   = (ax_ - w * math.cos(perp), ay_ - w * math.sin(perp))
        tip_x, tip_y = ax_ + l * math.cos(rad), ay_ + l * math.sin(rad)
        p3   = (tip_x - w * math.cos(perp), tip_y - w * math.sin(perp))
        p4   = (tip_x + w * math.cos(perp), tip_y + w * math.sin(perp))
        msp.add_lwpolyline([p1, p2, p3, p4],
                           dxfattribs={"layer": "ANTENNA", "closed": True})
        msp.add_text(
            f"ANT-{az:03d}",
            dxfattribs={"layer": "TEXT", "height": 8, "insert": (ax_ + 5, ay_ + 5)},
        )
        msp.add_line((ax_, ay_), (cx + 50, cy - 50), dxfattribs={"layer": "CABLE"})

    # ── Equipment ────────────────────────────────────────────────────────────
    _add_rect(msp, cx + 40, cy - 80, 40, 25, "EQUIPMENT")
    msp.add_text("BTS CABINET",
                 dxfattribs={"layer": "TEXT", "height": 7, "insert": (cx + 42, cy - 72)})

    # Power cabinet — intentionally unlabelled (error detector will catch)
    _add_rect(msp, cx + 90, cy - 80, 30, 25, "EQUIPMENT")

    # ── North indicator ──────────────────────────────────────────────────────
    nx, ny = 820, 680
    msp.add_line((nx, ny), (nx, ny + 40),      dxfattribs={"layer": "NORTH"})
    msp.add_line((nx, ny + 40), (nx - 8, ny + 25), dxfattribs={"layer": "NORTH"})
    msp.add_line((nx, ny + 40), (nx + 8, ny + 25), dxfattribs={"layer": "NORTH"})
    msp.add_text("N", dxfattribs={"layer": "NORTH", "height": 12, "insert": (nx - 5, ny + 45)})

    # ── Dimensions ───────────────────────────────────────────────────────────
    msp.add_text(
        "TOWER HEIGHT: 40m  |  SITE AREA: 80m x 70m",
        dxfattribs={"layer": "DIMENSION", "height": 9, "insert": (150, 30)},
    )

    doc.saveas(output_path)
    return output_path


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _add_layer(doc, name: str, color: int):
    if name not in doc.layers:
        doc.layers.add(name, dxfattribs={"color": color})


def _add_rect(msp, x: float, y: float, w: float, h: float, layer: str):
    msp.add_lwpolyline(
        [(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        dxfattribs={"layer": layer, "closed": True},
    )
