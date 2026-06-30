import { env } from '../../../env.ts'
import type { OAuthProvider, ProviderProfile } from './types.ts'

const AUTHORIZE_URL = 'https://open.weixin.qq.com/connect/qrconnect'
const TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token'
const USERINFO_URL = 'https://api.weixin.qq.com/sns/userinfo'

type WxTokenResponse = {
  access_token?: string
  openid?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

type WxUserInfo = {
  nickname?: string | null
  headimgurl?: string | null
  errcode?: number
  errmsg?: string
}

export const wechatProvider: OAuthProvider = {
  name: 'wechat',
  buildAuthorizeUrl(state) {
    const url = new URL(AUTHORIZE_URL)
    url.searchParams.set('appid', env.WECHAT_OAUTH_APP_ID)
    url.searchParams.set('redirect_uri', env.WECHAT_OAUTH_REDIRECT_URI)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'snsapi_login')
    url.searchParams.set('state', state)
    return url.toString()
  },
  async exchangeCode(code): Promise<ProviderProfile> {
    const tokenUrl = new URL(TOKEN_URL)
    tokenUrl.searchParams.set('appid', env.WECHAT_OAUTH_APP_ID)
    tokenUrl.searchParams.set('secret', env.WECHAT_OAUTH_APP_SECRET)
    tokenUrl.searchParams.set('code', code)
    tokenUrl.searchParams.set('grant_type', 'authorization_code')

    const tokenRes = await fetch(tokenUrl)
    const tokenJson = (await tokenRes.json()) as WxTokenResponse
    if (tokenJson.errcode || !tokenJson.access_token || !tokenJson.openid) {
      throw new Error(`wechat token exchange failed: ${tokenJson.errmsg ?? 'unknown'}`)
    }

    const userUrl = new URL(USERINFO_URL)
    userUrl.searchParams.set('access_token', tokenJson.access_token)
    userUrl.searchParams.set('openid', tokenJson.openid)
    const userRes = await fetch(userUrl)
    const userJson = (await userRes.json()) as WxUserInfo
    if (userJson.errcode) {
      throw new Error(`wechat userinfo failed: ${userJson.errmsg ?? 'unknown'}`)
    }

    const subject = tokenJson.unionid ?? tokenJson.openid

    return {
      provider: 'wechat',
      subject,
      email: null,
      displayName: userJson.nickname ?? null,
      avatarUrl: userJson.headimgurl ?? null,
      rawMetadata: { token: tokenJson, user: userJson },
    }
  },
}
