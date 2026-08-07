export const buildResourceBalances = (
  fungibleItems: ReadonlyArray<{
    readonly resource_address: string
    readonly amount: { readonly toFixed: () => string }
  }>,
  nonFungibleAccounts: ReadonlyArray<{
    readonly nonFungibleResources: ReadonlyArray<{
      readonly resourceAddress: string
      readonly items: ReadonlyArray<{ readonly isBurned: boolean }>
    }>
  }>
): Record<string, string> => {
  const resourceBalances: Record<string, string> = {}

  for (const balance of fungibleItems) {
    resourceBalances[balance.resource_address] = balance.amount.toFixed()
  }

  for (const account of nonFungibleAccounts) {
    for (const resource of account.nonFungibleResources) {
      resourceBalances[resource.resourceAddress] = String(
        resource.items.filter((item) => !item.isBurned).length
      )
    }
  }

  return resourceBalances
}
