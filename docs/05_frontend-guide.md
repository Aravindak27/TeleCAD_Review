# 05 — Frontend guide

## Tech stack

- React 18
- Vite 5
- React Router
- Axios
- lucide-react icons

## Styling

Global theme + tokens: `frontend/src/index.css`

Important tokens:

- Backgrounds: `--bg-base`, `--bg-surface`, `--bg-card`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`
- Status: `--success`, `--warning`, `--danger`, `--info`

## Routing

`frontend/src/App.jsx` defines routes:

- `/login`
- `/signup`
- `/employee` (role-protected)
- `/manager` (role-protected)
- `/profile` (protected)

## API access

`frontend/src/api/client.js`:

- Axios instance with:
  - `baseURL` = `VITE_API_URL` or `http://localhost:8000`
  - request interceptor attaches `Authorization: Bearer <token>`
  - 401 handler clears session + redirects to `/login`

## Auth state

`frontend/src/contexts/AuthContext.jsx` stores:

- `user`
- `loading`
- `login(token, user)`
- `logout()`

User is persisted in `localStorage` as `user`, and token as `token`.

## Main UI components

### Navbar

`frontend/src/components/Navbar.jsx`:

- Shows logo + current user block
- Clicking user block navigates to `/profile`
- History button opens `HistoryModal`

### HistoryModal

`frontend/src/components/HistoryModal.jsx`:

- Fetches `/drawings/history`
- Shows table of all versions
- Rendered as a centered modal overlay

### UploadComponent

`frontend/src/components/UploadComponent.jsx`:

- Drag/drop + click to upload
- Sends multipart form data to `/drawings/upload`

### DrawingViewer

`frontend/src/components/DrawingViewer.jsx`:

- Renders Base64 image
- SVG overlay markers for issues
- Manager mode: crosshair placement to open annotate modal
- Employee mode: click-and-drag panning + “Drag to move” hint

### IssuePanel / ManagerReviewModal

Manager workflow for issue creation and approve/send back.

## Sidebar multi-select + favourites

Implemented as UI state:

- `selectionMode`: when true, show checkboxes
- `selectedDrawingIds`: selected drawing ids
- favourites stored in local storage by `thread_id`

Notes:

- Favouriting pins drawings to the top of a group list.
- Delete calls `DELETE /drawings/{id}` (thread delete).

