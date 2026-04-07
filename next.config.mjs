/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'parsefiles.back4app.com',
      'files.parsetfss.com',
      'parse-server-files.back4app.com',
    ],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false, net: false, tls: false, crypto: false,
    };
    return config;
  },
};

export default nextConfig;
