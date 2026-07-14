import { Prisma, PrismaClient } from '@prisma/client'

// Single shared Prisma client for the process.
export const prisma = new PrismaClient()

export { Prisma }
