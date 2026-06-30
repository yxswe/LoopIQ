import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app.ts'
import { requireAdmin, requireAuth } from '../../middleware/auth.ts'
import {
  createInvitation,
  deleteInvitation,
  listInvitations,
} from './invitation.repo.ts'

const createBody = z.object({
  count: z.number().int().min(1).max(50).default(1),
  expiresInDays: z.number().int().min(1).max(365).default(30),
})

export const adminRoute = new Hono<AppEnv>()
  .use('*', requireAuth, requireAdmin)
  .get('/invitations', (c) => c.json(listInvitations()))
  .post('/invitations', zValidator('json', createBody), (c) => {
    const { count, expiresInDays } = c.req.valid('json')
    const admin = c.get('user')!
    const created = Array.from({ length: count }, () =>
      createInvitation({ createdBy: admin.id, ttlDays: expiresInDays }),
    )
    return c.json(created)
  })
  .delete('/invitations/:id', (c) => {
    deleteInvitation(c.req.param('id'))
    return new Response(null, { status: 204 })
  })
