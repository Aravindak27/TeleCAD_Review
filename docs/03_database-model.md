# 03 — Database model

## Database engine

- SQLite, file-backed
- Connection string: `sqlite:///./telecom_cad.db`
- Stored in `backend/telecom_cad.db`

## Tables

### `users`

Fields (see `backend/database.py`):

- `id` (PK)
- `name`
- `email` (unique)
- `hashed_password` (bcrypt hash string)
- `role` (`employee` or `manager`)
- `created_at`

### `drawings`

Fields:

- `id` (PK)
- `filename` (display name)
- `original_path` (stored upload)
- `dxf_path` (converted DXF; may be null for old versions after cleanup)
- `image_path` (rendered PNG; may be null for old versions after cleanup)
- `status` (`pending`, `reviewed`, `approved`, `sent_back`)
- `manager_comment` (optional comment, commonly used on send-back)
- `uploaded_by` (FK → users.id)
- `assigned_manager_id` (FK → users.id, nullable)

Threading/versioning:

- `thread_id` (root drawing id for the thread)
- `version` (int; starts at 1)
- `is_latest` (bool; only one row per thread is latest)

Timestamps:

- `created_at`
- `updated_at`

### `issues`

Fields:

- `id` (PK)
- `drawing_id` (FK → drawings.id)
- `type`
- `severity` (`Critical`, `Warning`, `Info`)
- `message`
- `position_x`, `position_y` (CAD coordinate space)
- `created_by` (string; currently “Manager”)
- `resolved` (bool)
- `created_at`

---

## Relationships

- `users.drawings` → drawings uploaded by the user
- `users.assigned_drawings` → drawings assigned to a manager
- `drawings.issues` → issue list attached to drawing

---

## Lightweight migrations

`backend/database.py:init_db()`:

- Creates tables if missing
- Adds missing columns (`assigned_manager_id`, `thread_id`, `version`, `is_latest`) if DB exists but schema is older
- Backfills `thread_id = id` when missing

