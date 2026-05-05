# Whatsapp Wrapped

A login-gated, local-processing web app that computes a private annual wrap-up from WhatsApp chat export ZIPs.

## Features

- Upload multiple WhatsApp **Export chat** ZIP files.
- Parse chat text locally in the browser with JSZip.
- Only include the rolling 365 days before the page is opened.
- Mark one or more detected sender names as yourself.
- Show totals, media counts, voice memo counts, participant rankings, activity by hour, per-chat summaries, and average response times.
- Disable usage on mobile-sized screens.

## Privacy

- Chat ZIPs are not uploaded.
- Imported data is kept in React memory and is cleared on refresh, sign-out, or tab close.





```text
https://whatsappwrapped.marfeyx.ch
```

## Development

Install Node.js 20 or newer, then run:

```powershell
npm install
npm run dev
```

Build for production:

```powershell
npm run build
```

Preview the production build:

```powershell
npm run preview
```

## GitHub Pages

The repository includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml` and a `CNAME` file for:

```text
whatsappwrapped.marfeyx.ch
```

After pushing to `main`, GitHub Actions builds the Vite app and deploys `dist/`.
