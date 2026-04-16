# 02 — Local setup

## Backend setup

### Install dependencies

From `backend/`:

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### Run the backend

```bash
python -m uvicorn main:app --reload --port 8000
```

Endpoints:

- API root: `http://localhost:8000/`
- Swagger docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

### Backend environment variables

Backend reads `.env` in `backend/` (via `python-dotenv`).

Common variables:

- `SECRET_KEY`: JWT signing key (change in production)
- `ACCESS_TOKEN_EXPIRE_HOURS`: token expiry (default 24)
- `UPLOAD_DIR`: where DXF/PNG are stored (default `./uploads`)
- `BASE_URL`: used to generate `image_url` in responses (default `http://localhost:8000`)

---

## Frontend setup

From `frontend/`:

```bash
npm install
npm run dev
```

### Frontend environment variables

Create `frontend/.env`:

```bash
VITE_API_URL=http://localhost:8000
```

If unset, frontend defaults to `http://localhost:8000`.

---

## Database

The backend uses SQLite at:

- `backend/telecom_cad.db`

Schema is managed by SQLAlchemy models in `backend/database.py`.
There is a small “lightweight migration” section which adds missing nullable columns for older DB files.

---

## Common dev ports

- Backend: `8000`
- Frontend (Vite): `5173` (may change if occupied)

---

## First-time usage

1. Open `http://localhost:5173`
2. Sign up as **manager** and as **employee**
3. Log in as employee → upload a drawing → assign manager
4. Log in as manager → review → add issues → approve/send back

