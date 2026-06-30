import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.WECHAT_OAUTH_APP_ID = 'wx_app_id'
  process.env.WECHAT_OAUTH_APP_SECRET = 'wx_app_secret'
  process.env.WECHAT_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/oauth/wechat/callback'
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { wechatProvider } from '../../../src/modules/auth/providers/wechat.ts'

describe('wechatProvider', () => {
  beforeEach(() => {
    process.env.WECHAT_OAUTH_APP_ID = 'wx_app_id'
    process.env.WECHAT_OAUTH_APP_SECRET = 'wx_app_secret'
    process.env.WECHAT_OAUTH_REDIRECT_URI =
      'http://localhost:3000/api/auth/oauth/wechat/callback'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('buildAuthorizeUrl produces a snsapi_login URL with required params', () => {
    const url = new URL(wechatProvider.buildAuthorizeUrl('STATE-WX'))
    expect(url.host).toBe('open.weixin.qq.com')
    expect(url.searchParams.get('appid')).toBe('wx_app_id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/oauth/wechat/callback',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('snsapi_login')
    expect(url.searchParams.get('state')).toBe('STATE-WX')
  })

  it('exchangeCode: prefers unionid when present', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'AT', openid: 'OPENID-1', unionid: 'UNION-1' }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ nickname: 'WX Nick', headimgurl: 'https://x/y.png' }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )

    const p = await wechatProvider.exchangeCode('CODE')
    expect(p.subject).toBe('UNION-1')
    expect(p.email).toBeNull()
    expect(p.displayName).toBe('WX Nick')
    expect(p.avatarUrl).toBe('https://x/y.png')
  })

  it('exchangeCode: falls back to openid when no unionid', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'AT', openid: 'OPENID-2' }), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nickname: null, headimgurl: null }), {
          headers: { 'content-type': 'application/json' },
        }),
      )

    const p = await wechatProvider.exchangeCode('CODE')
    expect(p.subject).toBe('OPENID-2')
  })

  it('throws on WeChat error envelope', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ errcode: 40029, errmsg: 'invalid code' }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(wechatProvider.exchangeCode('BAD')).rejects.toThrow()
  })
})
