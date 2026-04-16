# 07 — Troubleshooting

## Frontend shows no managers in dropdown

Symptoms:

- Employee upload requires manager selection
- Dropdown is empty

Checks:

- Backend is running on `:8000`
- Frontend `VITE_API_URL` points to backend (or defaults to `http://localhost:8000`)
- Token exists in browser local storage (`token`)

## History modal empty

Known cause fixed in this repo:

- FastAPI route shadowing: `/drawings/history` must be defined **before** `/drawings/{drawing_id}`

If still empty:

- Verify backend logs show requests to `/drawings/history`
- Confirm there is data in `backend/telecom_cad.db` table `drawings`
- Confirm user role filtering matches your expectation

## Upload fails

Common reasons:

- Missing `assigned_manager_id` (required for non-demo uploads)
- Unsupported file extension
- DWG conversion tool missing / failing (if your conversion depends on external ODA converter)

Backend returns useful HTTP 400 `detail` strings for most validation failures.

## Preview not visible / image missing

Possible reasons:

- Rendering failed (pipeline is “best-effort”; a drawing can still be saved even if render fails)
- Browser is blocking mixed content (if frontend served https but backend is http)

## Issues not visible for employee

Employee UI intentionally hides issues while drawing is pending review.
After manager approves/sends back, issues become visible.

## 401 redirects to login

Expected behavior:

- Axios interceptor clears `token` and `user` and redirects to `/login`

Causes:

- Expired token
- Backend SECRET_KEY changed (invalidates old tokens)

