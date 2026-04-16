# Telecom CAD Data Extraction & Review Engine
**Comprehensive Technical Documentation**

---

## 1. Executive Summary

The Telecom CAD Data Extraction and Review Engine is a highly specialized, full-stack enterprise web application designed explicitly for telecommunications engineering workflows. Telecommunications infrastructure planning relies heavily on intricate CAD (Computer-Aided Design) drawings representing tower layouts, antenna positions, and critical site schematics. Historically, reviewing these drawings involved fragmented software ecosystems: engineers would author files in native desktop CAD suites, export static PDFs, and email them to managers, leading to friction in version control, poor issue-tracking, and disjointed communication.

This application acts as a centralized, singular pipeline to collapse that fragmented ecosystem into one continuous web-based workflow. It enables engineers to upload raw `.dxf`, `.dwg`, and multi-page `.pdf` files directly through a web portal. The system automatically processes and parses these files, extracting embedded geometric entities and metadata natively in the cloud. It dynamically re-renders these files into interactive high-fidelity 2D digital canvases on the web. 

Managers are provided with a dedicated tracking dashboard to isolate assigned files, render them directly in their browser, and overlay specific "Engineering Issues" via a coordinate-mapped point-and-click interface. Crucially, the system supports robust branching version control, persistent engineering feedback loops, and an integrated SMTP notification pipeline that automatically alerts engineers to status shifts and annotated issues.

---

## 2. System Architecture

The application adopts a decoupled Client-Server RESTful architecture. This design guarantees separation of concerns: the backend strictly manages heavy, CPU-bound processing tasks (like CAD vector parsing and image rendering) and persistence, while the front end focuses exclusively on state synchronization and high-performance interactive visualizations.

* **The Frontend (Client Layer)**: An optimized Single Page Application (SPA) driven by React 18 and bundled via Vite. It focuses on asynchronous data fetching, local caching, and custom component composition.
* **The Backend (Application Layer)**: Driven by Python's FastAPI framework. It provides lightning-fast asynchronous HTTP endpoints, dependency injection for secure routing, and background task management for third-party integrations (such as Email SMTP). 
* **The Database (Persistence Layer)**: Utilizes SQLite powered by the SQLAlchemy Object Relational Mapper (ORM), allowing for entirely Pythonic database queries while ensuring structural integrity through explicit relational foreign keys.

This architecture is robust yet geographically portable. By containerizing the processing pipeline and embedding an automated SQLite migration script, the entire ecosystem can be bootstrapped on local developer machines in under 60 seconds without requiring external clustered database hosting.

---

## 3. Frontend Implementation (Client Tier)

The frontend client is the primary interface for all user interactions. It was constructed prioritizing speed, responsiveness, and aesthetic minimalism. By avoiding heavy UI component libraries (like Material-UI or Ant Design), the project maintains a tiny bundle footprint, relying strictly on vanilla CSS Variables for a bespoke "glassmorphism" aesthetic.

### 3.1 Technology Stack
* **React 18**: Provides the core component tree and reactive rendering cycles.
* **Vite**: Replaces Webpack or Create-React-App for near-instant Hot Module Replacement (HMR) and highly optimized production builds.
* **React Router v6**: Manages declarative routing and navigation mapping between disparate views.
* **Axios**: Configured with persistent interceptors to handle outgoing JWT attachments and globally catch `401 Unauthorized` responses to seamlessly purge corrupted sessions.
* **Lucide-React**: Supplies scalable, consistent SVG iconography globally.

### 3.2 State Management & Context
Rather than implementing Redux, which introduces excessive boilerplate for simple applications, the system utilizes React's natively provided `Context API` combined with standard hooks (`useState`, `useReducer`, `useEffect`).

An overarching `<AuthProvider>` wraps the entire application tree. It actively synchronizes with the `localStorage` payload, ensuring the `user` object and `token` persist across hard refreshes. It abstracts authentication logic (`login()`, `logout()`), allowing child nodes to painlessly invoke `useAuth()` to determine their specific view access.

### 3.3 Routing and Protected Views
In `App.jsx`, routes are heavily guarded by a custom `<ProtectedRoute>` higher-order component. 
* Unauthenticated users are strictly bounded to `/login` and `/signup`.
* Authenticated users are explicitly shunted based on their `role` attribute.
* If a User (`employee`) attempts to navigate to `/manager`, the `ProtectedRoute` intercepts the route parameters, detects the role mismatch, and natively forces a `<Navigate>` invocation backwards to `/employee`, ensuring strict lateral security isolation.

### 3.4 Key Pages and Layouts

**EmployeeDashboard.jsx**:
The focal point for engineers. It leverages a customized Split-Pane layout with a resizable CSS grid. The left sidebar contains a dynamically adjusting file-list (constructed using a hidden `useRef` drag handle, tracking global mouse events independent of React state rendering cycles to ensure hyper-smooth 60Hz sliding mechanisms). The right side houses the primary `<DrawingViewer>`, an interactive viewer that maps CAD bounds to specific screen coordinate limits.

**ManagerDashboard.jsx**:
Visually symmetrical to the Employee dashboard but structurally inverted. Instead of uploading new files, Managers receive a populated feed of files assigned specifically to their `user_id`. When clicking a drawing, they enter an interactive review state, firing up the `<ManagerReviewModal>`.

**ProfilePage.jsx**:
A dense, standalone telemetry dashboard. It acts as the user's command center:
1. **Activity Timeline**: A continuous, chronologically mapped sequence parsing the `drawingsAPI.history()` endpoint. It maps status modifications visually utilizing a custom-built, in-place vertical scroll wrapper.
2. **Notification Configuration**: Direct hooks bridging the frontend checkboxes immediately into `PUT /auth/preferences` endpoints, instantly mutating the backend database preference logic.
3. **Daily Login Tracker**: A 30-day horizontal linear activity bar. Utilizing advanced `useMemo` hooks, it calculates the rolling differential between the current local timestamp and historic edits natively.

### 3.5 Theming and Global CSS Architecture
The entire visual engine relies absolutely on localized CSS Variables defined at the `:root` level in `index.css`. 
By declaring a secondary pseudo-selector `:root[data-theme='light']`, a localized script inside `App.jsx` can natively inject a `data-theme` attribute directly into the standard HTML Document Object model, instantaneously swapping out 40+ color parameters without forcing React to recursively re-render the components.

---

## 4. Backend Implementation (Application Tier)

The backend engine is constructed around FastAPI. It acts as the ultimate authority, validating inputs, computing geometry, rendering models, and persisting results.

### 4.1 Technology Stack & Core Mechanisms
* **FastAPI**: Chosen for its native asynchronous capabilities (`async / await`), built-in OpenAPI swagger documentation, and exceptional typing support leveraging Pydantic.
* **Uvicorn**: An ASGI web server implementation used to run FastAPI concurrently on multiple worker nodes.
* **JWT & Bcrypt**: Handles secure, stateless authentication tokens and one-way cryptographic password hashing.
* **ezdxf**: Provides deep introspective capabilities into CAD files, extracting layers, entities, blocks, and bounds without launching Heavy CAD suites.
* **PyMuPDF / fitz**: Implements lightning-fast rasterization converting uploaded multi-page PDFs directly into static bytes.

### 4.2 Security and Rate Limiting
Access control is deployed via a multi-tiered dependency injection pattern.
`get_current_user()` intercepts the incoming HTTP requests, decodes the `Authorization: Bearer <token>` header, verifies the cryptographic signature directly against the `SECRET_KEY`, and subsequently yields the active `User` database object directly into the target endpoint function scope. 

For destructive actions, `require_manager()` layers an additional assertion, deliberately throwing an HTTP `403 Forbidden` Exception if the parsed `User.role` does not strictly match the string literal `"manager"`.

### 4.3 CAD Processing Pipeline (`cad.*`)
The raw ingestion pipeline is the critical core of this web application, engineered to support multiple heterogeneous file formats dynamically.

When an endpoint receives a file upload, it first evaluates the extension in `drawings_router.py`:
1. **DXF/DWG Processing**: 
   - Non-DXF AutoCAD files (.dwg) are piped through a native subprocess integration bridging out to the *ODA File Converter* executable, physically translating proprietary binary formats into structurally open text-based DXF formats.
   - Flow is pushed to `extractor.py`, which utilizes `ezdxf` to iterate over ModelSpace entities, generating a high-level JSON structural payload encapsulating entity counts, layered vectors, and strict bounding-box coordinations.
   - The payload is forwarded to `visualizer.py` drawing via `matplotlib` mechanisms, generating a precise, transparent `Base64` Encoded PNG response stream, effectively returning the CAD drawing directly into the web browser without any local desktop software dependencies.
2. **PDF Rasterization**:
   - `media_processor.py` captures PDF files. If the PDF contains multiple discrete pages, it structurally fragments the document, generating a continuous array of discrete PNG artifacts. The system encodes the response by storing comma-separated file paths internally, generating seamless array-based visual representations.

### 4.4 The Asynchronous Email Engine (`email_service.py`)
To prevent network lag (SMTP operations typically take 1 to 4 seconds to resolve), the Email Notification subsystem was engineered entirely on background threads.

1. The manager hits the `/status` endpoint with an "approve" or "send back" signal.
2. The endpoint instantly parses the `User` object of the drawing's original author.
3. It validates the user's localized notification preferences (`notif_email_approved` and `notif_email_sent_back`).
4. If flagged as `True`, the router leverages FastAPI’s `BackgroundTasks`, explicitly registering the `send_status_email` callback function.
5. The router completely detaches, returning a `200 OK` status back to the manager's browser immediately.
6. The background loop spins up the Python `smtplib` mechanisms, connecting explicitly to `smtp.gmail.com` on port `587`, initiates a strict TLS encryption layer, securely authenticates using an application-specific environment password, and fires a comprehensively structured, highly stylized HTML payload directly to the user's inbox securely over MIME text protocols.

---

## 5. Database Architecture (Persistence Tier)

The relational engine backing the application guarantees that issues map perfectly to drawn coordinates and assigned personnel configurations are strictly enforced.

### 5.1 Relational Models (`database.py`)
Driven strictly by SQLAlchemy Object Relational Modeling:
* **The `User` Model**: 
  - Tracks foundational access control (Emails, Hashed variables, Role assignments).
  - Explicitly mapped with notification boolean preferences ensuring synchronization between the frontend settings layer and the backend mailing dispatcher.
* **The `Drawing` Model**: 
  - The highest level abstraction for submitted work payloads. 
  - Maintains strict state mechanisms (`status`: pending, reviewed, approved, sent_back).
  - Generates comprehensive metadata payloads mapping original paths, dxf paths, and multi-image raster sequences.
  - Generates explicit `ForeignKeys` binding the file absolutely to an `uploaded_by` User and an `assigned_manager` User.
* **The `Issue` Model**:
  - Encapsulates critical vector coordinates. It defines explicitly *where* on the drawing coordinate plane a manager placed a marker (`position_x`, `position_y`), the associated severity, type, and specific text payload resolving the context of the drop point.

### 5.2 Version Threading Control
A unique feature of this application is its linear version threading architecture. Instead of just replacing a file, when an employee "re-uploads" a drawing that was sent back, the system fundamentally structures a new version track:
1. It queries the parent track via `thread_id`. 
2. It revokes the `is_latest` boolean flag off the historically dominant drawing entry, immediately purging its high-fidelity image artifacts to explicitly save localized disk space caching requirements.
3. It structurally promotes the new insertion, escalating its explicit `version` integer value and mapping it as `is_latest = True`.
4. This ensures that past iterations are perpetually preserved inside the History database, retaining strict accountability while keeping the actual active working folder explicitly lightweight and uncluttered.

### 5.3 Automated Schema Migrations
Rather than integrating complex, heavy framework-specific versioning structures like Alembic, the local database initiates via a bespoke `init_db()` protocol sequence.
When executed, it inherently probes the SQLite system internals interrogating the `PRAGMA table_info()` tables. If newer parameters like `thread_id`, `version`, or the `notif_email_*` variables are historically missing from the legacy tables, it natively compiles raw recursive `ALTER TABLE` sequences appending them dynamically. This structural paradigm essentially eliminates complex developer synchronization errors, safely enabling cross-machine portability natively.

---

## 6. Core Application Workflows

### 6.1 The Upload & Extract Flow
When an Engineer logs onto the dashboard, they hit the `Upload DWG/DXF` button sequence.
The user's file is pushed as a `multipart/form-data` payload asynchronously. The backend intercepts this file natively in memory, spools it to disk, triggers the ODA file conversion binaries, fires up `ezdxf` geometry mappings, and structurally bounds the coordinates. 
Once successfully rasterized, the local response returns a completely base64 encoded PNG representation alongside the vector extents natively back dynamically reflecting it back into the user’s drawing panel.

### 6.2 The Review & Annotation Interaction
When the Manager loads a pending drawing:
1. They utilize mouse scroll mapping techniques to zoom and click directly on localized visual geometry issues present on the generated canvas layout.
2. Clicking fires an absolute coordinate event map interacting securely with the database coordinates via a reactive cross-haired offset alignment.
3. The `<ManagerReviewModal>` triggers immediately, mapping the literal offset clicks locally allowing them to log their distinct Issue marker directly over the target target. 
4. This marker is directly pushed to the `POST /issues/` endpoints locking the coordinate natively into the target drawing matrix securely.

When the manager finally submits their overall status verdict (Approval or Rejection), the SMTP protocol handles the closure loop, issuing an instant HTML dispatch to the engineer notifying them to act accordingly. 

---

## 7. Operational Viability and Roadmap

The TeleCAD Engine operates exactly as designed to replace multi-tiered fractured workflows explicitly replacing heavy proprietary software demands by entirely centralizing the process into web-standard rendering layers. 

### Future Optimization Avenues:
1. **S3 Cloud Bucket Migration**: Currently, files map natively to localized `uploads/images` directories on the local machine deployment. Moving file storage hooks to `boto3` driven S3 logic would natively decouple the application making multiple worker container deployments viable for massive vertical concurrency scaling.
2. **WebSocket Synchronization**: Migrating specific API polls to native WebSocket interfaces would enable continuous real-time multi-manager cursors operating transparently simultaneously on a single centralized Drawing canvas layout globally.
3. **Advanced Vector Rasterization Enhancements**: Utilizing WASM (WebAssembly) implementations over simple server-side Image generation could push drawing vector layers directly onto the user's local browser context structurally offloading backend processing limits substantially accelerating massive drawing view-port updates.

### Conclusion
By leveraging the combined integration architecture of FastAPI, SQLite, and React, the system acts as a highly specialized, intensely structured data extraction utility built explicitly around standard operational requirements for enterprise CAD engineering departments guaranteeing robust persistence, scalable interactivity, and secure collaborative coordination across widespread engineering divisions perfectly natively.
