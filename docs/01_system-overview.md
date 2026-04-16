# 01 — System overview

## What TeleCAD does

TeleCAD is a review workflow for telecom CAD drawings:

- Employees upload **DXF/DWG** and assign a manager.
- The backend converts/validates the CAD file, extracts basic drawing metadata, and renders a **PNG preview**.
- Managers review assigned drawings, place issues directly on the drawing, and either:
  - **Approve** (final), or
  - **Send back** with a comment (employee must re-upload a corrected version).

The system supports **version threads** (re-upload creates a new version under a shared `thread_id`) so both sides can see the evolution of a drawing over time.

---

## Roles

### Employee

- Upload drawing and choose a manager
- View personal drawings list (grouped by manager)
- Open drawing details
  - Preview image
  - Issues (only after manager action)
  - Status and manager comment
  - Thread “manager chat” (manager comments across versions)
- Re-upload only when status is **sent_back**
- Use History modal to see all versions (role-scoped)

### Manager

- See employees with drawings assigned to them
- Drill into an employee → list of drawings
- Open drawing detail:
  - Viewer with issue markers
  - Click-to-place issues
  - Approve / Send back

---

## Core concepts

### Drawing lifecycle

Typical flow:

1. Employee uploads → status **pending**
2. Manager opens:
   - UI may mark pending drawings as **reviewed**
3. Manager decides:
   - **approved**
   - **sent_back** + comment
4. If sent back, employee re-uploads → new version under same thread → status **pending**

### Threading & versions

Database fields:

- `thread_id`: the root id for the thread (first version uses its own id as thread root)
- `version`: integer version, starts at 1
- `is_latest`: latest version in the thread is `true`, older versions become `false`

Re-upload rules (enforced server-side):

- Only allowed for employee’s own thread
- Only allowed if latest version is **sent_back**
- Manager assignment must match the thread’s original assignment

### Issues

Issues are **manager-created** annotations with:

- `type` (e.g. Tower/Antenna/Equipment)
- `severity` (Critical/Warning/Info)
- `message`
- CAD-space position (`position_x`, `position_y`)
- `resolved` (toggle)

Issues render as markers overlayed on the PNG in the viewer.

---

## Repository layout

```
AutoCAD_v1/
  backend/
    main.py
    database.py
    auth.py
    routers/
      auth_router.py
      drawings_router.py
      issues_router.py
    cad/
      converter.py
      extractor.py
      visualizer.py
    uploads/
    telecom_cad.db

  frontend/
    index.html
    vite.config.js
    src/
      App.jsx
      index.css
      api/client.js
      contexts/AuthContext.jsx
      pages/
      components/
```

