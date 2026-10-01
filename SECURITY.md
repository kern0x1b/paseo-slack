# Security Policy

## Reporting a Vulnerability

Report suspected vulnerabilities in this project to
**157722763+kern0x1b@users.noreply.github.com**. Do not open a public issue.

Include the project version, reproduction steps, and potential impact.

You can also use
[GitHub Security Advisories](https://github.com/kern0x1b/paseo-slack/security/advisories/new).

## What to Expect

| Stage                           | Target           |
| ------------------------------- | ---------------- |
| Acknowledgement of report       | 3 business days  |
| Initial assessment and severity | 10 business days |
| Fix released                    | 90 days          |

## Safe Harbour

We will not pursue legal action against anyone who discovers and reports a vulnerability in good faith, provided that you:

- Test only against your own accounts and workspaces that you own;
- Do not access, modify, or exfiltrate data belonging to anyone else;
- Give reasonable time to respond and patch before public disclosure.

## Scope

In scope:

- Handling and storage of user credentials (`xoxp-`, `xoxc-`, `xapp-`, cookie `d`);
- Inbound event filtering logic in daemon and subscriptions;
- Command injection prevention in Paseo agent dispatcher;
- MCP tool parameter validation.

Out of scope:

- Vulnerabilities in Slack or Slack Web API itself;
- Vulnerabilities in Paseo itself;
- Scenarios requiring local root execution on the host machine.
