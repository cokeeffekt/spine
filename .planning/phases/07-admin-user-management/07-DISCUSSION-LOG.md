# Phase 7: Admin User Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 07-admin-user-management
**Areas discussed:** Admin page access, User list display, Action UX, Last-admin guard

---

## Admin Page Access

### How should the admin reach the admin page?

| Option | Description | Selected |
|--------|-------------|----------|
| Nav link (admins only) | Add a "Users" link to nav bar, visible when role === 'admin'. Consistent with existing nav. | ✓ |
| Dedicated /admin route | Separate URL path, typed manually or linked from settings menu. | |
| Settings dropdown | User menu with "Admin" option for admins. More scalable. | |

**User's choice:** Nav link (admins only)
**Notes:** None

### Should the admin page be a new view or an overlay?

| Option | Description | Selected |
|--------|-------------|----------|
| New view | Add 'admin' to $store.app.view. Full-page, consistent with library/detail. | ✓ |
| Slide-over panel | Side panel over current view. No existing pattern for this. | |

**User's choice:** New view
**Notes:** None

### Should the player bar stay visible on admin page?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep player visible | Player bar stays at bottom. Admin can manage users while listening. | ✓ |
| Hide player on admin | Clean management screen, no player. | |

**User's choice:** Keep player visible
**Notes:** None

### Nav link label?

| Option | Description | Selected |
|--------|-------------|----------|
| "Users" text link | Clear, descriptive, matches page content. | ✓ |
| Gear icon only | Compact but less discoverable. | |
| "Admin" text link | Generic, could encompass future features. | |

**User's choice:** "Users" text link
**Notes:** None

---

## User List Display

### What info should show for each user?

| Option | Description | Selected |
|--------|-------------|----------|
| Username + role | Minimal essentials. | ✓ |
| Created date | When account was created. Requires new column. | ✓ |
| Last login | When user last authenticated. Requires tracking. | ✓ |
| "You" badge on own row | Highlight current admin's row. | ✓ |

**User's choice:** All four selected
**Notes:** Multi-select — user wants full info display.

### How should the user list be laid out?

| Option | Description | Selected |
|--------|-------------|----------|
| Simple table | Rows with columns. Straightforward for household-sized list. | ✓ |
| Card list | Each user as a card. More visual but takes more space. | |

**User's choice:** Simple table
**Notes:** None

---

## Action UX

### How should 'Create User' work?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline form above table | Username + password + role fields above table with Create button. | ✓ |
| Modal dialog | Centered modal with create form. | |
| Expandable row | '+ Add User' row at bottom that expands. | |

**User's choice:** Inline form above table
**Notes:** None

### How should delete confirmation work?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline confirm | Button changes to "Confirm delete?" with 3s timeout. | ✓ |
| Confirm modal | Modal popup with Cancel/Delete buttons. | |
| You decide | Claude picks best approach. | |

**User's choice:** Inline confirm
**Notes:** None

### How should password reset work?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline expand | Password field appears inline with Save/Cancel. | ✓ |
| Modal with password field | Small modal with password input. | |
| Auto-generate password | System generates random password, displays once. | |

**User's choice:** Inline expand
**Notes:** None

### How should success/error feedback display?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline status message | Brief text below form/table, auto-clears. | ✓ |
| Toast notification | Small popup in corner. No toast component exists. | |
| You decide | Claude picks simplest approach. | |

**User's choice:** Inline status message
**Notes:** None

---

## Last-Admin Guard

### How should the last-admin guard work in the UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Disable delete button | Grey out delete on last admin with tooltip. | ✓ |
| Allow click, show error | Let backend reject, show error inline. | |
| You decide | Claude picks simplest. | |

**User's choice:** Disable delete button
**Notes:** None

### Should self-deletion be allowed when other admins exist?

| Option | Description | Selected |
|--------|-------------|----------|
| Block self-deletion always | Admins can never delete themselves. | ✓ |
| Allow if other admins exist | Flexible but adds edge cases. | |

**User's choice:** Block self-deletion always
**Notes:** None

---

## Claude's Discretion

- CSS styling for admin table and forms
- Whether create form is always visible or toggled
- Date formatting for timestamps
- Navigation details (back to library, etc.)

## Deferred Ideas

None — discussion stayed within phase scope
