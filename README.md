# WhatsApp Wrapped

A local-processing web app that computes a private annual wrap-up from WhatsApp chat export ZIPs.

## Features

- Upload multiple WhatsApp **Export chat** ZIP files.
- Parse chat text locally in the browser with JSZip.
- Only include the rolling 365 days before the page is opened.
- Mark one or more detected sender names as yourself.
- Show totals, media counts, voice memo counts, participant rankings, activity by hour, per-chat summaries, and average response times.
- Fully responsive landing page and results dashboard.
- Premium dark interface built with HeroUI v3 components and Tailwind CSS v4.
- Import without login.

## Privacy

- Chat ZIPs are not uploaded.
- Chat contents are not saved to localStorage, sessionStorage, or IndexedDB by this app.
- Imported data is kept in React memory and is cleared on refresh or tab close.
- No login or external auth service is used.
- Do not commit real chat exports, raw chat `.txt` files, or private keys.

## Configuration

No external auth configuration is required.

## Development

Install Node.js 24, then run:

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

The repository includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`. Vite uses relative asset paths, and `public/CNAME` preserves the custom domain in the deployment artifact:

```text
whatsappwrapped.marfeyx.ch
```

After pushing to `main`, GitHub Actions builds the Vite app and deploys `dist/`.
