# TeleCAD Review Platform — Management Overview Document

**Document Type:** Management Briefing  
**Project:** TeleCAD Review — Internal CAD Drawing Review System  
**Version:** 1.0  
**Date:** May 2026  

---

## 1. Executive Summary

TeleCAD Review is an internal web-based platform designed to streamline the end-to-end lifecycle of CAD (Computer-Aided Design) drawing submissions, reviews, and approvals within the telecom engineering team. It replaces email-based drawing review workflows with a structured, traceable, and role-controlled digital system.

The platform supports two primary roles:
- **Employee** — Uploads and submits drawings for review
- **Manager** — Reviews, annotates, approves, or sends back drawings for correction

---

## 2. Business Problem Solved

Previously, drawing reviews were conducted via email attachments, causing:
- Loss of feedback threads
- No version history or traceability
- Inability to annotate directly on the drawing
- Unclear ownership and assignment
- No centralised status tracking

**TeleCAD Review solves all of these** with a dedicated, role-separated, fully auditable review platform.

---

## 3. System Architecture Overview

| Layer | Technology |
|---|---|
| Frontend | React (Vite), Vanilla CSS |
| Backend | Python FastAPI |
| Database | SQLite (local, file-based) |
| File Storage | Local filesystem (uploads/) |
| Authentication | JWT Bearer Token |
| CAD Processing | DXF parsing + PDF/image rendering pipeline |

The system runs as two services:
- **Backend API** on `http://localhost:8000`
- **Frontend App** on `http://localhost:5173`

---

## 4. Key Features & Functionalities

### 4.1 Role-Based Access Control (RBAC)

| Feature | Employee | Manager |
|---|---|---|
| Upload drawings | ✅ | ❌ |
| Submit for review | ✅ | ❌ |
| View own drawings | ✅ | ❌ |
| View assigned drawings | ❌ | ✅ |
| Annotate / Add issues | ❌ | ✅ |
| Approve drawing | ❌ | ✅ |
| Send back with comments | ❌ | ✅ |
| Upload corrected version | ✅ | ❌ |
| Delete own drawings | ✅ (with rules) | ❌ |
| Soft-delete assigned drawings | ❌ | ✅ (with rules) |

---

### 4.2 Drawing Lifecycle & Status Flow

Every drawing passes through a well-defined lifecycle:

```
[Draft] → [Pending Review] → [Under Review] → [Approved]
                                         ↘ [Sent Back / Revisions Needed]
                                                  ↓
                                         [New Corrected Version Uploaded]
                                                  ↓
                                      Old version → [Older Version]
                                      New version → [Draft] → cycle repeats
```

| Status | Description |
|---|---|
| **Draft** | Drawing uploaded but not yet submitted to manager |
| **Pending Review** | Submitted by employee, awaiting manager review |
| **Under Review** | Manager has opened and is reviewing the drawing |
| **Approved ✓** | Manager has approved the drawing |
| **Revisions Needed** | Manager sent it back with correction notes |
| **Older Version** | Previous version archived after a correction is re-uploaded |

---

### 4.3 Folder-Based Version Control

- Each unique drawing project is represented as a **Folder** in the sidebar.
- When an employee uploads a **new drawing**, a new folder is automatically created.
- The folder name is derived from the filename (cleaned and capitalised).
- When an employee uploads a **corrected version** of a sent-back drawing, it goes into the **same folder** as a new version (`v1`, `v2`, `v3`…).
- Clicking a folder expands it to show **all versions** of that drawing.
- The latest version is always shown at the top, marked **"Latest"**.
- Older versions are archived with the **"Older Version"** status and remain viewable for historical reference.

---

### 4.4 Manager Review Workflow

Managers interact with drawings through a split-screen review panel:

- **Left panel (60%):** Full-resolution CAD drawing viewer
- **Right panel (40%):** Issue list, annotations, and decision controls

**Manager Actions:**
1. Select an employee from the sidebar → see their drawings/folders
2. Click a folder to expand it → click a version to open it
3. Click anywhere on the drawing to add a **pinned annotation/issue**
4. Add issue type (Tower, Antenna, Microwave, Equipment, Cable, Foundation, Layout, Text, General) and severity (Critical / Warning / Info)
5. Add a comment or clarification note
6. Use the **Review & Approve** button to:
   - **Approve** — Drawing is finalised
   - **Send Back** — Drawing is returned with a mandatory comment explaining corrections needed

> **Note:** Managers cannot approve or send back "Older Version" drawings. Actions are only available on the latest active version.

---

### 4.5 Issue & Annotation System

- Issues are pinned to specific coordinates on the drawing canvas.
- Each issue has: **Type**, **Severity**, **Description**, **Position (X/Y)**, **Page Index**
- Managers can also add **Comments / Doubts** (a softer form of annotation, non-blocking)
- Employees can also add their own comments/questions on a drawing
- All issues are visible on the drawing as overlay markers
- Issues persist across versions for full audit trail

---

### 4.6 Version History & Traceability

- All versions of a drawing are preserved in the database.
- Older versions retain their **image, issues, and comments** for historical review.
- Both employees and managers can view older versions by expanding the folder in the sidebar.
- The version badge (`v1`, `v2`, …) is shown on every drawing item.

---

### 4.7 Deletion Rules & Safeguards

#### Employee Deletion Rules
| Status | Can Employee Delete? |
|---|---|
| Draft | ✅ Yes |
| Pending Review | ✅ Yes |
| Under Review | ❌ No |
| Approved | ✅ Yes |
| Revisions Needed | ❌ No |
| Older Version | ✅ Yes |

#### Manager Deletion Rules
| Status | Can Manager Delete? |
|---|---|
| Pending Review | ✅ Yes (soft-delete) |
| Under Review | ❌ No — must approve or send back first |
| Approved | ✅ Yes (soft-delete) |
| Sent Back | ✅ Yes (soft-delete) |
| Older Version | ✅ Yes (soft-delete) |

> **Soft-delete:** When a manager deletes a drawing, it is hidden from their view only. The employee's copy is unaffected.

---

### 4.8 Favourites System

- Both employees and managers can **star (⭐) folders** for quick access.
- Both can also **star individual drawing versions** within a folder.
- Favourited folders appear at the top of the drawing list.
- Favourited versions within a folder bubble up just below the "Latest" version.
- Favourites are persisted per user in browser local storage.

---

### 4.9 Search, Filter & Sort

- **Employee side:** Search managers by name; search drawings by filename within a manager group
- **Manager side:** Search employees by name; search drawings by filename within an employee group
- **Sort:** Toggle ascending/descending by last updated date
- All searches are real-time and client-side for instant results

---

### 4.10 Email Notifications

The system can send automated email notifications to employees when:
- Their drawing is **Approved** by the manager
- Their drawing is **Sent Back** for revisions

Email preferences can be toggled per user from the **Profile** page.

---

### 4.11 User Account Management

- Users sign up via the **Signup page** with name, email, password, and role (Employee / Manager)
- Secure password hashing (bcrypt)
- JWT-based session management
- **Change Password** available from the Profile page
- Email notification preferences configurable per user

---

## 5. Security Controls

| Control | Implementation |
|---|---|
| Authentication | JWT Bearer Tokens (expires) |
| Role enforcement | Backend middleware (`get_current_user`, `require_manager`) |
| Data isolation | Employees see only their own; managers see only their assigned |
| Soft-delete isolation | Manager deletions do not affect employee views |
| Status-based operation locks | Backend validates status before allowing delete/review actions |

---

## 6. System Scalability & Limitations

| Aspect | Current State |
|---|---|
| Database | SQLite (suitable for team-level usage) |
| File storage | Local filesystem |
| Concurrent users | Suitable for small-to-medium teams |
| File formats | DXF (AutoCAD native), PDF |
| Upgrade path | Can be migrated to PostgreSQL + cloud storage (S3/Azure Blob) |

---

## 7. Operational Summary

| Metric | Detail |
|---|---|
| Typical upload time | 5–30 seconds (depends on DXF complexity) |
| Supported file types | `.dxf`, `.pdf` |
| Review turnaround | Real-time once manager opens drawing |
| Data retention | Permanent (until manually deleted) |
| Backup | SQLite DB file (`telecad.db`) + `uploads/` folder |

---

## 8. Conclusion

TeleCAD Review provides a structured, traceable, and auditable workflow for managing CAD drawing submissions and approvals within telecom engineering teams. It eliminates email-based inefficiencies and provides both employees and managers with a clear, role-specific interface to track the full lifecycle of every drawing — from initial upload through to final approval or revision.

---

*Document prepared for internal management review. For technical queries, contact the development team.*
