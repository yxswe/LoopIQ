export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',

  // Auth / session
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173',
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME ?? 'loopiq_sid',

  // Storage
  DATA_DIR: process.env.DATA_DIR ?? './data',

  // Google OAuth (optional — provider is reported as unavailable if missing)
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
  GOOGLE_OAUTH_REDIRECT_URI:
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    'http://localhost:3000/api/auth/oauth/google/callback',

  // WeChat OAuth (optional)
  WECHAT_OAUTH_APP_ID: process.env.WECHAT_OAUTH_APP_ID ?? '',
  WECHAT_OAUTH_APP_SECRET: process.env.WECHAT_OAUTH_APP_SECRET ?? '',
  WECHAT_OAUTH_REDIRECT_URI:
    process.env.WECHAT_OAUTH_REDIRECT_URI ??
    'http://localhost:3000/api/auth/oauth/wechat/callback',
} as const

export const isDev = env.NODE_ENV !== 'production'

export const googleEnabled = Boolean(
  env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET,
)

export const wechatEnabled = Boolean(
  env.WECHAT_OAUTH_APP_ID && env.WECHAT_OAUTH_APP_SECRET,
)
