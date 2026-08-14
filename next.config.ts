import type { NextConfig } from "next";
import path from "node:path";

// Loader path from orchids-visual-edits - use direct resolve to get the actual file
const loaderPath = require.resolve('orchids-visual-edits/loader.js');

const nextConfig: NextConfig = {
  output: "standalone",
  // Use a separate dist dir for production builds so `next build` doesn't
  // conflict with the running `next dev` (Turbopack) cache in .next/
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  // Use project root for tracing so the standalone output is clean.
  // The original '../../' was harmless pre-standalone but now causes
  // the dev cache (.next/) and other dirs to pollute the bundle.
  outputFileTracingRoot: process.env.NEXT_BUILD_DIR
    ? path.resolve(__dirname)
    : path.resolve(__dirname, '../../'),
  // data/ holds the live database and generated PDFs of whichever machine runs
  // the build; it must never be traced into the standalone output.
  outputFileTracingExcludes: {
    '*': ['data/**'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    rules: {
      "*.{jsx,tsx}": {
        loaders: [loaderPath]
      }
    }
  }
} as NextConfig;

export default nextConfig;
