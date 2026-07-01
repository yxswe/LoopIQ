import { z } from 'zod'

export const createConversationBody = z.object({
  name: z.string().min(1).max(200).nullable().optional(),
})

export const promptBody = z.object({
  text: z.string().min(1).max(100_000),
})
