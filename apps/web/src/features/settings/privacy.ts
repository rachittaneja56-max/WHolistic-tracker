export function confirmsAccountDeletion(confirmation: string, accountEmail: string) {
  const expected = accountEmail.trim().toLocaleLowerCase("en-US")
  return expected.length > 0 && confirmation.trim().toLocaleLowerCase("en-US") === expected
}
