# TeleCAD Review System (AutoCAD_v1)

TeleCAD is a **telecom CAD drawing review & annotation system** with two roles:

- **Employee**: upload DXF/DWG → assign a manager → view preview, status, issues after review → re-upload when “sent back”.
- **Manager**: see assigned employee drawings → open preview → place issues on drawing → approve or send back with comments.

This repository contains:

- `backend/`: FastAPI + SQLite + CAD processing pipeline
- `frontend/`: React (Vite) UI

> **Primary goal**: a clean, role-based workflow for drawing upload, preview rendering, manager annotation (manual issues), and versioned re-upload threads.

---

## Project status (features implemented)

- **Auth**: signup/login (JWT), `/auth/me`, managers list, change password
- **Drawings**:
  - Upload DXF/DWG (DWG converts to DXF server-side)
  - Render to PNG preview (Base64 returned to UI; also stored to `/uploads/images`)
  - Role-scoped listing (employee: own, manager: assigned)
  - Detail view: image + issues + bounds
  - Status updates: pending → reviewed → approved | sent_back
  - **Version threads**: re-upload creates new version under same `thread_id`
  - History list (role-scoped) includes thread/version data
  - Delete drawing **thread** (all versions)
- **Issues**: manager-only create/update/delete/resolve; marker overlay in viewer
- **UI/UX**:
  - Dark “engineering” theme (design tokens in `frontend/src/index.css`)
  - Employee dashboard groups drawings by manager + thread “manager chat”
  - Manager dashboard groups drawings by employee
  - “Mail-like” selection mode with favourites + delete in sidebars
  - Drawing viewer: zoom, markers, and employee drag-to-pan hint
  - Profile page (name/email/role/stats + change password)

---

## Quickstart (Windows)

### Prerequisites

- **Python**: 3.10+ recommended (project currently runs with a newer Python in your environment too)
- **Node.js**: 18+ recommended

### 1) Backend

Open a terminal in `backend/`:

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`.
Swagger docs: `http://localhost:8000/docs`

### 2) Frontend

Open a second terminal in `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### API base URL

The frontend uses `VITE_API_URL`:

- Create `frontend/.env`:

```bash
VITE_API_URL=http://localhost:8000
```

If not set, it defaults to `http://localhost:8000`.

---

## High-level architecture

### Backend (FastAPI)

- Entry point: `backend/main.py`
- Routers:
  - `backend/routers/auth_router.py` → `/auth/*`
  - `backend/routers/drawings_router.py` → `/drawings/*`
  - `backend/routers/issues_router.py` → `/issues/*`
- Auth utilities: `backend/auth.py` (bcrypt + JWT)
- Data model: `backend/database.py` (SQLAlchemy + lightweight SQLite migrations)
- Upload storage: `backend/uploads/` (or `UPLOAD_DIR`)

### Frontend (React + Vite)

- Routing: `frontend/src/App.jsx`
- Auth state: `frontend/src/contexts/AuthContext.jsx`
- API client: `frontend/src/api/client.js` (Axios + JWT header)
- Pages:
  - `frontend/src/pages/LoginPage.jsx`
  - `frontend/src/pages/SignupPage.jsx`
  - `frontend/src/pages/EmployeeDashboard.jsx`
  - `frontend/src/pages/ManagerDashboard.jsx`
  - `frontend/src/pages/ProfilePage.jsx`
- Key components:
  - `frontend/src/components/DrawingViewer.jsx`
  - `frontend/src/components/UploadComponent.jsx`
  - `frontend/src/components/HistoryModal.jsx`
  - `frontend/src/components/IssuePanel.jsx`
  - `frontend/src/components/ManagerReviewModal.jsx`

---

## Documentation index

For full in-depth documentation, see:

- `docs/01_system-overview.md`
- `docs/02_local-setup.md`
- `docs/03_database-model.md`
- `docs/04_api-reference.md`
- `docs/05_frontend-guide.md`
- `docs/06_user-workflows.md`
- `docs/07_troubleshooting.md`
- `docs/08_security-and-ops.md`

