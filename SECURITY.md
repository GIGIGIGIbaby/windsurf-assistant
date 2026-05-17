# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
responsibly:

1. **Do not** open a public GitHub issue.
2. Email the maintainer (via GitHub's noreply address):
   `zhouyoukang@users.noreply.github.com`
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested remediation (if available)

You will receive an acknowledgement within 7 days. If the issue is
confirmed, a fix will be prepared and disclosed responsibly with credit
to the reporter (unless anonymity is requested).

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | Yes (active development) |
| Latest 2 tagged releases | Yes (security fixes only) |
| Older releases | Best effort |

## Scope

This security policy covers:

- The code in this repository
- The packaged VSIX extensions under `packages/`
- The bootstrap scripts under `scripts/`

Out of scope:

- Third-party services this project may interact with (Windsurf IDE,
  Codeium services, GitHub Actions, Cloudflare, etc.) — please report
  those to the respective vendors.
- User-controlled deployments (each end user self-hosts their own copy
  with their own credentials; PAT/token security is the user's
  responsibility).

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter sends the vulnerability privately (see above).
2. Maintainer acknowledges within 7 days and works on a fix.
3. Once a fix is ready, a patched release is published.
4. A security advisory is published (typically 7-30 days after the
   patched release, depending on severity and exposure).

## Acknowledgements

Thank you for helping keep this project and its users safe.

---

*帛书六十三「图难于其易也 · 为大于其细也」*
*Difficult tasks are achieved by starting with the easy parts;
great works are completed by attending to small details.*
