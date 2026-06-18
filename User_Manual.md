# TeleCAD Review — User Manual

**Application:** TeleCAD Review  
**Version:** 1.0  
**Audience:** All Users (Employees & Managers)  
**Date:** May 2026  

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Signing Up](#2-signing-up)
3. [Logging In](#3-logging-in)
4. [Employee Guide](#4-employee-guide)
   - 4.1 Dashboard Overview
   - 4.2 Uploading a New Drawing
   - 4.3 Submitting a Drawing for Review
   - 4.4 Understanding Drawing Statuses
   - 4.5 Viewing Your Drawings & Folders
   - 4.6 Uploading a Corrected Version
   - 4.7 Adding Comments to a Drawing
   - 4.8 Deleting Drawings
   - 4.9 Favourites
5. [Manager Guide](#5-manager-guide)
   - 5.1 Dashboard Overview
   - 5.2 Viewing Assigned Drawings
   - 5.3 Reviewing a Drawing
   - 5.4 Adding Issues & Annotations
   - 5.5 Approving a Drawing
   - 5.6 Sending Back for Revisions
   - 5.7 Viewing Version History
   - 5.8 Deleting Drawings
   - 5.9 Favourites
6. [Profile & Settings](#6-profile--settings)
7. [Status Reference](#7-status-reference)
8. [FAQ & Troubleshooting](#8-faq--troubleshooting)

---

## 1. Getting Started

TeleCAD Review is a web application. Open your browser and go to:

```
http://localhost:5173
```

You will be taken to the **Login** page. If you are a new user, click **"Sign Up"** to create your account first.

---

## 2. Signing Up

1. On the Login page, click **"Create an account"** or navigate to `/signup`.
2. Fill in the form:
   - **Full Name** — Your display name within the system
   - **Email Address** — Used for login and notifications
   - **Password** — Minimum 6 characters (choose something secure)
   - **Role** — Select either:
     - `Employee` — If you upload drawings for review
     - `Manager` — If you review and approve drawings
3. Click **"Create Account"**.
4. You will be redirected to the Login page. Log in with your new credentials.

> ⚠️ **Important:** Your role is set at registration and determines what you can see and do in the application. Choose carefully.

---

## 3. Logging In

1. Enter your **Email** and **Password**.
2. Click **"Sign In"**.
3. You will be taken to your dashboard based on your role:
   - **Employees** → Employee Dashboard
   - **Managers** → Manager Dashboard

> If you forget your password, contact your system administrator to reset it.

---

## 4. Employee Guide

### 4.1 Dashboard Overview

After logging in as an employee, you will see a **three-panel layout**:

| Panel | Description |
|---|---|
| **Left sidebar — Managers** | Shows all managers you have sent drawings to, grouped |
| **Middle sidebar — Drawings/Folders** | Shows your drawings organised into folders for the selected manager |
| **Main area** | Upload panel (default), or selected drawing detail view |

At the top, a **Stats bar** shows total drawings, approved count, pending count, and revisions needed.

---

### 4.2 Uploading a New Drawing

1. Click the **"Upload Drawing"** button in the top toolbar, or use the upload panel shown on the main area.
2. Select the **Manager** you want to send the drawing to from the dropdown.
3. Use the **Upload Component** to:
   - Drag and drop a `.dxf` or `.pdf` file, OR
   - Click to browse and select the file from your computer
4. The file will be processed and uploaded. A loading indicator will appear.
5. Once complete, a **new folder** is automatically created in the sidebar named after your file (e.g., `Tower Site Plan`).
6. The drawing starts in **Draft** status.

> 📁 A new folder = a new drawing project. Each unique drawing gets its own folder.

---

### 4.3 Submitting a Drawing for Review

After uploading, your drawing is in **Draft** state. The manager cannot see it yet.

To submit it:

1. Click the drawing in the folder to open it.
2. In the top-right of the drawing detail view, click the **"Submit to Manager"** button.
3. The status will change to **Pending Review**.
4. The manager can now see and review it.

> You can edit or delete a Draft before submitting. Once submitted, you cannot delete it until reviewed.

---

### 4.4 Understanding Drawing Statuses

| Status | What It Means | What You Can Do |
|---|---|---|
| 🟡 **Draft** | Uploaded, not yet submitted | Submit, Delete |
| 🟠 **Pending Review** | Submitted, waiting for manager | Delete |
| 🔵 **Under Review** | Manager is currently reviewing it | View only |
| 🟢 **Approved ✓** | Drawing has been approved | View, Delete |
| 🔴 **Revisions Needed** | Manager sent it back for corrections | Upload corrected version |
| ⚪ **Older Version** | An earlier version, archived | View, Delete |

---

### 4.5 Viewing Your Drawings & Folders

- The **middle sidebar** lists all your drawing folders for the selected manager.
- Each folder shows:
  - 📁 Folder icon with the drawing project name
  - Number of versions (e.g., `(3 versions)`)
  - Latest status badge
- Click a folder to **expand it** and see all versions inside.
- Click any version to open it in the main view.
- The **"Latest"** badge marks the most recent version.

---

### 4.6 Uploading a Corrected Version

When a drawing is sent back with the status **"Revisions Needed"**:

1. Click on the drawing (latest version) in the folder.
2. In the top-right of the detail view, click **"Upload Corrected Drawing"**.
3. Upload the new corrected `.dxf` or `.pdf` file.
4. The corrected file is added as a **new version** (e.g., `v2`) in the **same folder**.
5. The previous sent-back version is automatically archived as **"Older Version"**.
6. The new corrected drawing starts in **Draft** — submit it to the manager again.

> The folder now shows both versions. The manager can see the full history.

---

### 4.7 Adding Comments to a Drawing

You can add your own comments/questions to a drawing:

1. Open any drawing in the detail view.
2. Click the **"Add Comment"** or issue form option.
3. Toggle **"Mark as Comment / Doubt"** checkbox.
4. Enter your message.
5. Click **Save**.

Your comment will appear in the issue/comment list alongside any manager annotations.

---

### 4.8 Deleting Drawings

You can delete drawings or entire folders using **Selection Mode**:

1. Click the **"Select" (☑)** button in the toolbar above the drawing list.
2. Check the boxes next to individual drawings **or** folders (not both at the same time).
3. Use the **Trash (🗑)** button to delete selected items.

**Rules:**
- You can delete: **Draft**, **Pending Review**, **Approved**, **Older Version**
- You **cannot** delete: **Under Review**, **Revisions Needed**
- You **cannot** delete a folder if any version inside it is Under Review or needs Revisions

> A confirmation prompt will always appear before any deletion.

---

### 4.9 Favourites

**Favouriting a Folder:**
1. Enter Selection Mode.
2. Check the folder(s) you want to favourite.
3. Click the **Star (⭐)** button.
4. Favourited folders will float to the top of your list.

**Favouriting an Individual Drawing Version:**
1. Expand a folder to see its versions.
2. Click the **⭐ star icon** on the right side of any version item.
3. That version will bubble up just below the "Latest" version inside the folder.

---

## 5. Manager Guide

### 5.1 Dashboard Overview

After logging in as a manager, you will see:

| Panel | Description |
|---|---|
| **Left sidebar — Employees** | Shows all employees who have submitted drawings to you |
| **Middle sidebar — Drawings/Folders** | Folders for the selected employee |
| **Main area (split screen)** | Left: Drawing viewer | Right: Issues/Annotations panel |

---

### 5.2 Viewing Assigned Drawings

1. Click an **Employee** in the left sidebar to select them.
2. Their drawing folders appear in the middle sidebar.
3. Click a folder to **expand** it and see all versions.
4. Click any version to open it in the main view.

> Drawings in **Draft** status are not visible to managers — employees must submit them first.

---

### 5.3 Reviewing a Drawing

When you click a drawing to open it:

- The **left panel** shows the full CAD drawing rendered as an image.
- The **right panel** shows:
  - List of existing issues/annotations
  - The decision controls (Approve / Send Back)
- Click anywhere on the drawing image to **add an issue pinned to that location**.

---

### 5.4 Adding Issues & Annotations

1. Click on the drawing canvas at the location of concern.
2. The **Review Modal** opens automatically.
3. Fill in:
   - **Type:** Tower / Antenna / Microwave / Equipment / Cable / Foundation / Layout / Text / General
   - **Severity:** Critical / Warning / Info
   - **Description:** Explain the issue clearly
   - **Position:** Auto-filled from where you clicked
4. Click **"Save Issue"**.
5. The issue marker appears on the drawing.

**To add a Comment/Doubt instead of an engineering issue:**
- Check the **"Mark as Comment / Doubt"** checkbox before saving.

---

### 5.5 Approving a Drawing

When the drawing is ready for approval:

1. Click the **"Review & Approve"** button in the toolbar.
2. In the Review Modal, scroll to the **"Complete Review"** section.
3. Click **"Approve Drawing"**.
4. The drawing status changes to **Approved ✓**.
5. The employee receives an email notification (if enabled).

> You can only approve the **latest version**. Older versions are read-only.

---

### 5.6 Sending Back for Revisions

When corrections are needed:

1. Click the **"Review & Approve"** button.
2. In the modal, enter a **mandatory comment** explaining what needs to change.
3. Click **"Send Back"**.
4. The drawing status changes to **Revisions Needed**.
5. The employee is notified and can upload a corrected version.

> A comment is required when sending back. Be clear and specific to avoid repeat revisions.

---

### 5.7 Viewing Version History

When a drawing has multiple versions:

1. Click the **folder** in the sidebar to expand it.
2. All versions are listed below the folder header:
   - **Latest** badge on the newest version
   - **"Older Version"** status on archived versions
3. Click any version to open and review it.
4. You can view all issues and comments on any historical version.

> You cannot Approve or Send Back an "Older Version" — only the latest active version.

---

### 5.8 Deleting Drawings

1. Click the **"Select" (☑)** button in the toolbar.
2. Check individual drawing versions or entire folders.
3. Click the **Trash (🗑)** button.

**Manager Deletion Rules:**
- You **can** delete: Pending Review, Approved, Sent Back, Older Version
- You **cannot** delete: **Under Review** — you must Approve or Send Back first

> Manager deletions are **soft-deletes** — the drawing disappears from your view but the employee's copy is unaffected.

---

### 5.9 Favourites

**Favouriting Folders:**
1. Enter Selection Mode.
2. Select folders and click the **⭐ Star** button.
3. Starred folders rise to the top of the list.

**Favouriting Drawing Versions:**
1. Expand a folder.
2. Click the **⭐** icon on any version row.
3. That version bubbles up just below the "Latest" version.

---

## 6. Profile & Settings

Click your **avatar or name** in the top navigation bar to access your Profile page.

### What You Can Do on the Profile Page:

| Setting | Description |
|---|---|
| **View Profile** | See your name, email, and role |
| **Change Password** | Enter old password + new password to update |
| **Email Notifications** | Toggle email alerts for Approved / Sent Back events |

### Email Notification Settings:
- **Notify on Approval** — Receive an email when a manager approves your drawing
- **Notify on Send Back** — Receive an email when a manager returns your drawing for revisions

---

## 7. Status Reference

| Status | Icon | Meaning |
|---|---|---|
| Draft | 📄 Grey | Uploaded, not submitted |
| Pending Review | 🕐 Yellow/Orange | Submitted, not yet opened by manager |
| Under Review | 🔄 Blue | Manager is reviewing |
| Approved ✓ | ✅ Green | Approved by manager |
| Revisions Needed | ❌ Red | Sent back — corrections required |
| Older Version | 📄 Grey | Archived previous version |

---

## 8. FAQ & Troubleshooting

### Q: I uploaded a file but I can't see it in the drawing view.
**A:** Make sure you have selected a manager from the dropdown before uploading. If uploaded without a manager, it may not have been assigned correctly.

---

### Q: My manager can't see my drawing.
**A:** Check the drawing status. If it shows **Draft**, you need to click **"Submit to Manager"** first. Managers only see submitted drawings.

---

### Q: I clicked "Upload Corrected Drawing" but I'm getting an error.
**A:** Make sure you are uploading from the latest version of the drawing that has **"Revisions Needed"** status. Older versions do not have the re-upload option.

---

### Q: The drawing image is blank / empty.
**A:** If you are viewing a very old version that was archived before the latest update, the image may not be stored. New corrections uploaded from this point forward will retain their images permanently.

---

### Q: I can't delete a drawing.
**A:** Check the drawing's status:
- **Employees** cannot delete drawings that are Under Review or Revisions Needed.
- **Managers** cannot delete drawings that are Under Review — approve or send back first.

---

### Q: Why did my folder disappear after the manager deleted it?
**A:** If the manager deleted a drawing, it is only removed from their view (soft-delete). Your copy in the Employee Dashboard is unaffected.

---

### Q: Can I change my role after signing up?
**A:** No. Roles are assigned at registration. Contact your system administrator if you need a role change.

---

### Q: How do I add multiple issues on the same drawing?
**A:** Click different locations on the drawing canvas to add issues at each point. Each click opens the annotation modal for a new issue at that specific position.

---

### Q: What file types can I upload?
**A:** The system accepts `.dxf` (AutoCAD native format) and `.pdf` files.

---

*For technical support, contact your system administrator. For workflow questions, contact your team lead.*

---

**TeleCAD Review | Internal Use Only | v1.0 | May 2026**
