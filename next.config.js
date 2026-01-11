/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

// Only use Sentry if configured
if (process.env.SENTRY_DSN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
  const { withSentryConfig } = require('@sentry/nextjs')

  const sentryWebpackPluginOptions = {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  }

  const sentryOptions = {
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
  }

  module.exports = withSentryConfig(
    nextConfig,
    sentryWebpackPluginOptions,
    sentryOptions
  )
} else {
  module.exports = nextConfig
}
