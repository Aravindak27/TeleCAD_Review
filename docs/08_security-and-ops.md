# 08 — Security and ops notes

## Authentication

- JWT tokens signed with `SECRET_KEY` (HS256)
- Token subject is user email (`sub`)
- Token expiry controlled by `ACCESS_TOKEN_EXPIRE_HOURS`

**Production requirements**:

- Set a strong `SECRET_KEY`
- Use HTTPS
- Consider refresh tokens or shorter expiry + rotation

## Password hashing

Passwords are hashed using **bcrypt** (`backend/auth.py`).

Notes:

- bcrypt has a 72-byte input limit; code truncates to 72 bytes
- There is a fallback verifier for older passlib hashes

## CORS

Backend uses a dev-friendly `allow_origin_regex` allowing `http://localhost` / `http://127.0.0.1` on any port.

For production, restrict allowed origins.

## File uploads

Uploaded content is stored under `UPLOAD_DIR`:

- `dxf/`
- `images/`

Security considerations:

- Limit upload size at reverse proxy or via FastAPI config if deployed publicly
- Consider scanning uploads and running CAD conversion in a sandbox if untrusted input is expected

## Data retention

- Deleting a drawing via API deletes an entire thread (all versions).
- Old versions may have their DXF/PNG removed during version rollover to save space.

## Operational visibility

For production:

- Add structured logging
- Add request IDs
- Add metrics (upload time, render time, error rates)
- Add backup plan for `telecom_cad.db` and uploads folder

