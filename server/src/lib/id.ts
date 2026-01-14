// Generate random IDs for database records
export function generateId(): string {
  return crypto.randomUUID()
}
