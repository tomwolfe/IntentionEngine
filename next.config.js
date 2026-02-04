/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel Hobby tier configuration
  experimental: {
    // No long-running processes
  },
  // Ensure we're not using any Node.js specific APIs that won't work on edge
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig