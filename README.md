# CSITS Organization Task Tracker

A responsive, browser-only task tracker for the CSITS Organization. It uses vanilla HTML, CSS, and JavaScript, with browser `localStorage` for persistence—no backend, database, or installation step is required.

## Run locally

1. Open `index.html` in a modern desktop or mobile browser.
2. The first visit automatically loads clearly identified CSITS demonstration members and tasks.
3. Use the sidebar to switch among the Dashboard, Task Board, and Members views.

If your browser restricts ES modules when opening files directly, serve the folder with any static-file server (for example VS Code Live Server). No build process or package installation is needed.

## Features

- Dashboard summaries, searchable task overview, and dynamically calculated weekly pulse.
- Kanban board with task searching, member/priority/due-date filters, and per-card status updates.
- Reusable add/edit task form with required-field validation, date/member validation, status history, and delete confirmation.
- Member directory with email validation, assignment/completion counts, search, and safe deletion protection.
- Weekly report generator using a selected inclusive local-date range. The convenient current-week option defines a week as **Monday through Sunday**.
- Print-friendly reports (use the browser print dialog to save as PDF) and CSV exports that match the selected report period.
- Responsive mobile navigation, keyboard-accessible modals, success/error notifications, helpful empty states, and a persistent Dark Mode toggle.

## Storage and data model

The application saves these keys in the browser profile where it runs:

- `csits-tracker.tasks.v1`
- `csits-tracker.members.v1`
- `csits-tracker.preferences.v1`

Tasks include a unique ID, creation timestamp, update timestamp, and status-change history. This allows reports to determine work created or completed during a range and calculate the saved status as of the report end date. For malformed or absent saved values, the app safely falls back to an empty collection. Refreshing the page does not duplicate demo records.

To reset the demonstration data during development, clear this site’s local storage in browser developer tools and refresh. This intentionally removes your locally saved entries.

## Project structure

```text
CSITS_TaskTracker/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js          # rendering, modals, event handling
│   ├── storage.js      # localStorage and first-run demo data
│   ├── tasks.js        # task validation and CRUD
│   ├── members.js      # member validation and CRUD
│   └── reports.js      # reporting, CSV, date helpers
├── assets/
│   └── Logo.png        # CSITS organization logo
└── README.md
```

The interface uses `assets/Logo.png` for the sidebar and generated report branding.

## Quick testing checklist

- [ ] Create, edit, view, move, and delete a task; refresh to verify it persists.
- [ ] Filter tasks on the Dashboard and the Task Board; clear the filters.
- [ ] Add and edit a member; verify invalid email feedback.
- [ ] Attempt to delete a member with tasks and confirm deletion is prevented.
- [ ] Generate a report for current week and a custom inclusive date range.
- [ ] Export CSV and compare its counts/lists with the open report.
- [ ] Print the report and confirm navigation and controls are absent from preview.
- [ ] Resize to a narrow viewport and use the menu button.

## AI assistance disclosure template

> AI assistance was used during development to help draft and refine portions of the CSITS Organization Task Tracker. The developer reviewed, tested, and adapted the generated code, design, and documentation, and remains responsible for the final submission and its behavior.
