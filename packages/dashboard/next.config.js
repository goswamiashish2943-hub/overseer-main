/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: false,
    workerThreads: true,
    webpackBuildWorker: false,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
  },
};

module.exports = nextConfig;
