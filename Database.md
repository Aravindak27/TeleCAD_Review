# Telecom CAD Review System - Database Documentation

This document provides a comprehensive overview of the database architecture, schema definitions, relationships, and data lifecycle for the Telecom CAD Review System.

## Database Overview

The system uses **SQLite** as its relational database management system, chosen for its simplicity and ease of deployment without needing a standalone server. The database file is stored locally as `telecom_cad.db`.

**Object-Relational Mapping (ORM)** is handled by **SQLAlchemy**. It defines models, relationships, and manages sessions for safe concurrent data fetching and writing. The database connection explicitly allows multithreading (`check_same_thread: False`) which is required for FastAPI's async asynchronous request handlers interacting with SQLite.

---

## Schema Definitions

The database consists of three primary tables: `users`, `drawings`, and `issues`.

### 1. `users` Table
Stores authentication and role-based access information for all users.

| Column | Type | Constraints / Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | Primary Key, Indexed | Unique identifier for the user. |
| `name` | `String(100)` | Not Null | Full display name. |
| `email` | `String(100)` | Unique, Indexed, Not Null | Email address used for login. |
| `hashed_password` | `String(255)` | Not Null | Bcrypt hashed password. |
| `role` | `String(20)`| Not Null | Access level: `"employee"` or `"manager"`. |
| `created_at` | `DateTime` | Default: UTC Now | Timestamp of account creation. |

**Relationships:**
- **`drawings`**: 1-to-Many mapping to the `Drawing` table (Drawings uploaded by this user).
- **`assigned_drawings`**: 1-to-Many mapping to the `Drawing` table (Drawings pending review by this manager).

---

### 2. `drawings` Table
The core table tracking CAD files, their processing statuses, and version histories.

| Column | Type | Constraints / Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | Primary Key, Indexed | Unique identifier for the drawing record. |
| `filename` | `String(255)` | Not Null | Display name of the uploaded drawing. |
| `original_path` | `String(500)` | Not Null | File system path to the original uploaded raw file. |
| `dxf_path` | `String(500)` | Nullable | File system path to the processed `.dxf` version. |
| `image_path` | `String(500)` | Nullable | File system path to the rendered 2D `.png` image overlay. |
| `status` | `String(20)` | Default: `"pending"` | Workflow status lifecycle: `pending` → `reviewed` → `approved` / `sent_back`. |
| `manager_comment` | `Text` | Nullable | Feedback provided by a manager upon sending back a file. |
| `uploaded_by` | `Integer` | Foreign Key (`users.id`) | The employee who authored/uploaded the drawing. |
| `assigned_manager_id` | `Integer` | Foreign Key (`users.id`), Null | The manager assigned to review this file. |
| `thread_id` | `Integer` | Nullable | Groups a set of drawing versions together. If new, `thread_id = id`. |
| `version` | `Integer` | Default: `1` | Incrementing version number within the thread. |
| `is_latest` | `Boolean` | Default: `True` | Flag to denote if this is the active/latest version of a thread. |
| `created_at` | `DateTime` | Default: UTC Now | Timestamp of initial upload. |
| `updated_at` | `DateTime` | Auto-updates | Timestamp of the most recent status or data change. |

**Relationships:**
- **`uploader`**: Many-to-1 mapping to the `User` table.
- **`assigned_manager`**: Many-to-1 mapping to the `User` table.
- **`issues`**: 1-to-Many mapping to the `Issue` table. Configured with `cascade="all, delete-orphan"` so if a drawing is deleted, all its associated issues are heavily purged.

---

### 3. `issues` Table
Stores granular engineering annotations, feedback markers, or geometric problems managers identify on a specific CAD drawing.

| Column | Type | Constraints / Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | Primary Key, Indexed | Unique identifier for the issue. |
| `drawing_id` | `Integer` | Foreign Key (`drawings.id`) | The drawing this issue belongs to. |
| `type` | `String(50)` | Not Null | Category logic (e.g., `Tower`, `Antenna`, `Equipment`, `General`). |
| `severity` | `String(20)` | Not Null | Urgency mapping (`Critical`, `Warning`, `Info`). |
| `message` | `Text` | Not Null | Manager's detailed note on what needs fixing. |
| `position_x` | `Float` | Default: `0.0` | Exact X-coordinate placement in the CAD environment space. |
| `position_y` | `Float` | Default: `0.0` | Exact Y-coordinate placement in the CAD environment space. |
| `created_by` | `String(20)` | Default: `"Manager"` | Identification footprint for issue creation origin. |
| `resolved` | `Boolean` | Default: `False` | Has the employee addressed this in a later version? |
| `created_at` | `DateTime` | Default: UTC Now | Time the issue was recorded. |

**Relationships:**
- **`drawing`**: Many-to-1 mapping to the `Drawing` table.

---

## Technical Implementations

### Session Management
Database sessions are strictly controlled using a generator dependency strategy for FastAPI routes (`get_db()`). This ensures that every HTTP request opens an ephemeral transaction block. If an error is raised during the HTTP request lifecycle, the transaction properly falls through without freezing threads, and the `finally:` block enforces `.close()` preventing pooled connection bleed.

### Schema Migration Strategy
The architecture uses a lightweight custom migration pattern in `init_db()` rather than implementing a heavy dependency overhead like Alembic.
1. `Base.metadata.create_all` safely binds any non-existent tables right out of the box.
2. A raw `engine.begin()` connection grabs a read-lock on `PRAGMA table_info(drawings)`.
3. If structural columns like `assigned_manager_id`, `thread_id`, or `version` are missing (usually occurring on pre-existing local databases updating to a new core feature release), it executes targeted `ALTER TABLE` queries to seamlessly migrate users up to the latest capability level.

### Version Lifecycle
When a drawing is rejected (`sent_back`), the system does not overwrite the row. Instead, the front-end requests a "Re-Upload". 
The new drawing is placed into the exact same `thread_id`, its `version` integer goes up by `+1`, and it seizes the `is_latest = True` flag. The older iteration gracefully retires to `is_latest = False`, allowing an intact permanent history to be securely rendered in the historical log tables.
