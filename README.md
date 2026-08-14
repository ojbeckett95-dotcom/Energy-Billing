This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Network (LAN) access

The bundled server listens on `127.0.0.1` only, so a fresh install is reachable from the machine it
runs on and nowhere else. To let other machines on the network use it:

1. Open **Settings → Network** and turn on *Allow access from other devices on the network*.
2. Set a fixed port if 3001 is unsuitable, then click **Restart Now**.
3. On the server, allow inbound TCP on that port through the firewall.
4. From any LAN machine, browse to `http://<server-ip-or-hostname>:3001` and sign in with the same password.

Set `EB_BIND_HOST` (e.g. `EB_BIND_HOST=0.0.0.0`, or a single interface address) to override the bind
address without changing the setting — useful when running the server outside Electron.

Traffic is plain HTTP: the session cookie and password are readable by anything sniffing the network,
so only enable this on a trusted LAN. For HTTPS, put a TLS reverse proxy (Caddy, nginx) in front of
the app and keep the app itself on `127.0.0.1`.

## Building the Windows installer

Run this **on a 64-bit Windows machine** with [Bun](https://bun.sh) installed:

```bash
bun install
bun run electron:build
```

The installer lands in `dist/Energy Billing Setup <version>.exe`.

Build on Windows, not on Linux/macOS: `next build` resolves platform-specific binaries (e.g.
`sharp`) for the machine it runs on, so a cross-built package carries the wrong ones and image
handling fails at runtime. The installer is unsigned, so Windows SmartScreen warns on first run
until you choose *More info → Run anyway* (a code-signing certificate is the only way to remove that).

Never build on a machine that has live billing data in `data/` — the build excludes it, but keep it
that way if you change `next.config.ts`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
