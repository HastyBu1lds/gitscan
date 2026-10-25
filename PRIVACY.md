# Privacy Policy: gitscan

_Last updated: 2026-10-24_

gitscan is a browser extension that, on a GitHub repository page, looks for token contract addresses in the repository's description, README and a few root config files, and shows whether each address is a real token.

## What the extension does with data

**Runs locally in your browser**
- Reads the repository name from the GitHub page you are viewing.
- Scans the repository's public text (description, README, a few root config files) for blockchain addresses.

**Sent to third parties, only to do the check**
| Data | Sent to | Why |
|---|---|---|
| Repository name (`owner/name`) and, if you set one, your GitHub token | `api.github.com`, `raw.githubusercontent.com` (GitHub) | Fetch the repository's public files. The token is sent only to `api.github.com`. |
| Blockchain addresses found in the repository | `api.dexscreener.com` (Dexscreener) | Look up whether the address is a traded token. |
| Solana addresses found in the repository | `solana-rpc.publicnode.com` (PublicNode Solana RPC) | Check whether the address is a token mint, wallet or program. |

These services receive your IP address as any website does. The repository name is not sent to Dexscreener or the Solana RPC.

**Stored on your device (`chrome.storage.local`)**
- Your optional GitHub token and settings.
- Scan results, kept up to 30 minutes so repeat visits don't re-fetch.

## What it does not do
- No analytics, tracking, advertising or telemetry. There is no developer-run server.
- No collection of browsing history. It only acts on `github.com` repository pages, and it only reads the page's repository name.
- No sale or transfer of user data to third parties beyond the lookups listed above.
- No use of your data for creditworthiness or lending, and none for purposes unrelated to the extension's single purpose.

## Your GitHub token
The token is optional. If you add one, it is stored unencrypted in the extension's local storage on your device, as Chrome extensions normally store settings, and it is sent only to `api.github.com`. Use a fine-grained token with no permissions (public read-only). You can remove it at any time from the extension's options ("Remove token") or by uninstalling the extension.

## Not financial advice
Market data shown (price, market cap, liquidity) comes from Dexscreener and is informational only. A contract address appearing in a repository is a claim by whoever wrote it, not verification.

## Contact
privacy@example.com
