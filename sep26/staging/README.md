# INTELLIX staging runtime

This directory documents the isolated runtime fixture for Phase 6-8 verification. It is intentionally not connected to production.

## Provisioning boundary

A Google administrator must create a separate spreadsheet named `AI_Hackathon_STAGING` and a separate bound Apps Script project. Do not reuse the production spreadsheet or production deployment. Bind the staging project to the new spreadsheet, copy the files from `../app-script/`, verify the Apps Script project ID and spreadsheet ID, then push only from the staging project directory.

The current workspace cannot create Google resources or mint Google ID tokens. Therefore no `clasp push`, spreadsheet mutation, or web-app deployment is performed by the coding agent.

## Required staging sheets

Create these sheets with the same headers as the application:

- `Teams`
- `Problems`
- `Selections`
- `Domains`
- `Admins`
- `Config`

Populate them only with the synthetic records described in `fixtures.json`.

## Staging authentication

Use a dedicated staging OAuth client with localhost authorized origins and a client ID configured only in the staging frontend environment. Test tokens must be issued for the synthetic active admin and team leaders in the staging identity setup. Never place tokens in this repository.

## Safe verification sequence

1. Record the staging spreadsheet ID and Apps Script project ID separately from production.
2. Confirm `clasp status` points at the staging project before any push.
3. Push source only to the staging Apps Script project.
4. Run Apps Script editor tests against the staging spreadsheet.
5. Exercise the HTTP action matrix in `docs/runtime-test-plan.md` using staging tokens.
6. Verify Sheets rows after every admin mutation.
7. Run concurrent `LOCK_PROBLEM` requests for the same PSID and verify exactly one selection row.
8. Restore staging fixtures after tests; do not run these mutations against production.

Production deployment remains out of scope.
