# 06 — User workflows

## Employee workflow

### Signup/Login

- Create account as **employee**
- Login → redirected to `/employee`

### Upload

1. Click **Upload**
2. Choose a manager from dropdown
3. Upload `.dxf` or `.dwg`
4. After upload you see:
   - drawing preview
   - status badge

### View drawings

Left sidebar:

- First level: grouped by **manager**
- Second level: drawings under that manager

### Status & issues visibility

- While `pending/reviewed`, issue list may be hidden (depending on UI rules).
- After `approved` or `sent_back`, employee sees detected issues list.

### When sent back (revisions)

If manager sends back:

- status becomes `sent_back`
- manager comment is shown
- employee gets “Upload Corrected Drawing”
- new upload creates a new `version` under same `thread_id`

### History

History button shows all versions for employee’s own uploads.

### Favourites & delete

Within a manager’s drawings list:

- Click **Select** (list-check icon) to enable checkboxes
- Select multiple drawings
- Click:
  - Star → favourite
  - Trash → delete (thread delete)

Favourite drawings show a star next to their name and are sorted to the top of that list.

---

## Manager workflow

### Signup/Login

- Create account as **manager**
- Login → redirected to `/manager`

### Review queue

Left sidebar:

- First level: employees who uploaded drawings assigned to this manager
- Second level: drawings for selected employee

### Reviewing & annotating

1. Open a drawing
2. Use the issue placement mode (crosshair tool)
3. Click drawing to open review/annotate modal
4. Add issues (type, severity, message, coordinate)
5. Re-render to show updated markers if needed

### Decision

From toolbar:

- **Approve** → status = `approved`
- **Send back** + comment → status = `sent_back`

### History

History shows only drawings assigned to the manager (role-scoped).

### Favourites & delete

Within an employee’s drawings list:

- Click **Select** to enable checkboxes
- Star selected → favourite threads
- Delete selected → delete threads

---

## Profile page

Click user icon/name in the top navbar:

- View name/email/role
- View simple status stats
- Change password

