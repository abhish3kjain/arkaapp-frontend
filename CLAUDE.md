# Claude Instructions — ArkaApp Frontend

## Version Control

When bumping `APP_VERSION` in `ArkaMainAppCode.gs`, always update `VERSION.md` in the same commit:
- Add a new row to the table with the version number, date (YYYY-MM-DD), and a brief summary of what changed.
- The version in `ArkaMainAppCode.gs` is the single source of truth. The HTML display element reads it dynamically from the backend — no separate HTML change is needed.
