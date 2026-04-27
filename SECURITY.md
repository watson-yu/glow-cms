# Security Policy

## Reporting A Vulnerability

Please do not open public GitHub issues for security problems.

Report vulnerabilities privately to the maintainer with:

- A short description of the issue
- Steps to reproduce
- Impact assessment
- Suggested remediation, if available

If you already have a private contact channel with the maintainer, use that. Otherwise, open a GitHub issue only to request a private contact method without disclosing technical details.

## Scope

Security-sensitive areas in this project include:

- Admin authentication and session handling
- Database connection and setup flow (`.db-config.json`)
- System configuration storage
- LLM provider credentials
- Google OAuth credentials
- AWS S3 credentials and upload handling
- External database connection credentials (category sync)

## Expectations For Contributors

- Never commit live secrets, API keys, OAuth credentials, or production database details.
- Never commit raw database dumps from real environments.
- Sanitize logs, screenshots, and reproduction data before sharing.
- Prefer least-privilege credentials for local and staging environments.

## Disclosure

Please allow time for triage, validation, and remediation before any public disclosure.

