import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './db.ts'

const SESSION_DAYS = 30

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export async function createUser(email: string, name: string, password: string, role = 'strategist') {
  return prisma.user.create({
    data: { email: email.toLowerCase(), name, passwordHash: hashPassword(password), role },
  })
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user || user.passwordHash !== hashPassword(password)) return null
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.session.create({ data: { userId: user.id, token, expiresAt } })
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return session.user
}

export function parseAuthToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  const cookie = req.headers.cookie
  if (!cookie) return undefined
  const match = cookie.match(/groundwork_session=([^;]+)/)
  return match?.[1]
}

/** Optional auth guard — enforced when GROUNDWORK_REQUIRE_AUTH=1 or users exist. */
export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  const requireAuth = process.env.GROUNDWORK_REQUIRE_AUTH === '1'
  const userCount = await prisma.user.count()
  if (!requireAuth && userCount === 0) return
  const token = parseAuthToken(req)
  const user = await getSessionUser(token)
  if (!user) {
    reply.code(401).send({ error: 'Authentication required' })
    return reply
  }
  ;(req as FastifyRequest & { user?: typeof user }).user = user
}
