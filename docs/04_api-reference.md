# 04 — API reference

Base URL (local): `http://localhost:8000`

Auth: Bearer JWT via `Authorization: Bearer <token>`

> Tip: use `http://localhost:8000/docs` for interactive Swagger.

---

## Authentication (`/auth`)

### `POST /auth/signup`

Creates a user and returns a JWT.

Body:

```json
{
  "name": "Jane",
  "email": "jane@company.com",
  "password": "secret123",
  "role": "employee"
}
```

Response:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": { "id": 1, "name": "Jane", "email": "jane@company.com", "role": "employee" }
}
```

### `POST /auth/login`

Body:

```json
{ "email": "jane@company.com", "password": "secret123" }
```

Response: same as signup.

### `GET /auth/me`

Returns current user profile.

### `GET /auth/managers`

Returns all manager accounts (used by employee upload assignment).

### `POST /auth/change-password`

Body:

```json
{ "current_password": "old", "new_password": "newpass123" }
```

---

## Drawings (`/drawings`)

### `POST /drawings/upload`

Multipart form fields:

- `file`: uploaded file (DXF or DWG)
- `use_demo`: `"true"` to generate a demo DXF server-side (optional)
- `assigned_manager_id`: manager user id (required for non-demo upload)
- `thread_id`: thread root id for re-uploads (optional; used only for re-upload flow)

Response includes:

- `drawing`: drawing row
- `image_b64`: base64 PNG preview (may be null if render failed)
- `image_url`: static URL (best-effort)
- `bounds`: used for coordinate mapping in viewer

### `GET /drawings/`

Role-scoped list of **latest** drawings (`is_latest == true`):

- employee: own uploads
- manager: assigned drawings

### `GET /drawings/{drawing_id}`

Drawing detail (image + issues + bounds).

### `PUT /drawings/{drawing_id}/status`

Manager-only.

Body:

```json
{ "status": "approved", "manager_comment": "optional" }
```

Allowed status values: `approved`, `sent_back`, `reviewed`

### `GET /drawings/{drawing_id}/rerender`

Re-renders stored PNG with current issues.

### `GET /drawings/history`

Role-scoped history of all drawing versions (not just latest).

Returns rows containing:

- `thread_id`, `version`, `status`, `manager_comment`
- `employee_name`, `manager_name`
- `updated_at`, `created_at`

### `DELETE /drawings/{drawing_id}`

Deletes the **entire thread** for the drawing (all versions + issues + files).

Access:

- employee: can delete own threads
- manager: can delete assigned threads

---

## Issues (`/issues`)

### `GET /issues/{drawing_id}`

Role-scoped access:

- employee: own drawings only
- manager: assigned drawings only

### `POST /issues/`

Manager-only.

Body:

```json
{
  "drawing_id": 123,
  "type": "Tower",
  "severity": "Critical",
  "message": "Tower grounding missing",
  "position_x": 100.5,
  "position_y": 200.0
}
```

### `PUT /issues/{issue_id}/resolve`

Manager-only. Toggles `resolved`.

### `PUT /issues/{issue_id}`

Manager-only. Update fields.

### `DELETE /issues/{issue_id}`

Manager-only.

