import type { NextConfig } from "next";

function parseHostname(urlValue: string | undefined): string | null {
  if (!urlValue) return null;
  try {
    return new URL(urlValue).hostname;
  } catch {
    return null;
  }
}

const apiHost = parseHostname(process.env.NEXT_PUBLIC_API_BASE_URL);
const mediaHost = parseHostname(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
const extraHosts = Array.from(
  new Set(
    [
      "localhost",
      "127.0.0.1",
      "king-kush-stores.onrender.com",
      "res.cloudinary.com",
      apiHost,
      mediaHost,
    ].filter(Boolean) as string[],
  ),
);

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "**.onrender.com",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "**.vercel.app",
    pathname: "/**",
  },
];

for (const host of extraHosts) {
  remotePatterns.push(
    {
      protocol: "https",
      hostname: host,
      pathname: "/**",
    },
    {
      protocol: "http",
      hostname: host,
      pathname: "/**",
    },
  );
}

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns,
  },
};

export default nextConfig;

