import type { FormEvent } from 'react'
import { type ZodType, z } from 'zod'

export type FieldErrors = Record<string, string | undefined>

/** Reads the form's fields and validates them with a zod schema. */
export function parseForm<T>(e: FormEvent<HTMLFormElement>, schema: ZodType<T>) {
  const result = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
  if (result.success) return { data: result.data, errors: {} as FieldErrors }
  const fields = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>
  const errors: FieldErrors = {}
  for (const [key, messages] of Object.entries(fields)) errors[key] = messages?.[0]
  return { data: undefined, errors }
}
