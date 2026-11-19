import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const academicPlans = pgTable('academic_plans', {
  userId: text('user_id').primaryKey(),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
