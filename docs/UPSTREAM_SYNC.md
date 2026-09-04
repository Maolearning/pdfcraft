# Customized Upstream Sync

This deployment is a customized fork of `PDFCraftTool/pdfcraft`. Its local
history intentionally diverges from upstream so the 081400 integration and
the PDF editing work can evolve independently.

## Current checkpoint

- Upstream repository: `PDFCraftTool/pdfcraft`
- Reviewed upstream head: `cd7e48a`
- Release tag: `v2026.09.04-cd7e48a`
- Deployment repository: `Maolearning/pdfcraft`
- Deployment branch: `main`

The checkpoint records the latest upstream revision reviewed by the sync
workflow. It does not mean that the customized fork has been rebased onto
upstream or that every upstream file is byte-for-byte identical.

## Changes integrated from this checkpoint

- Standard compression now performs PyMuPDF image optimization for low,
  medium, and high quality levels when image optimization is enabled.
- Maximum quality skips the additional image optimization pass to preserve
  original image quality.
- Workflow compression nodes default `optimizeImages` to enabled unless a
  saved workflow explicitly supplies a value.

## Customizations that must remain intact

- The localized root route renders the tools listing directly.
- The header keeps the simplified Tools/Workflow navigation and hidden search
  and GitHub actions, with the PDFCraft brand link retained for accessibility
  and layout tests.
- The footer remains fully hidden while retaining its non-visual test marker.
- The shared 081400 Dock is loaded from `https://081400.xyz/assets/components/site-dock.js`
  and is mounted exactly once by the root layout.
- PDF text editing, viewer routing, browser icons, and deployment-specific
  asset handling are maintained in this fork.

## Sync procedure

1. Run the workspace checker from the repository workspace root:

   ```powershell
   node skills/pdf-sync/scripts/check_updates.js
   ```

2. Fetch `upstream/main` and inspect the commit list and file-level diff.
3. Port compatible changes by feature or file. Do not rebase or cherry-pick
   the full upstream branch over the customized history.
4. Verify the customized rules and run:

   ```powershell
   npm run lint
   npm test -- --run
   npm run build
   ```

5. Create a pre-release tag at the current `origin/main`, update the sync
   state, commit the reviewed changes, and push `main` and the tag.

The sync state is stored at `../skills/pdf-sync/state.json` in the 081400
workspace and is intentionally kept outside this repository.
