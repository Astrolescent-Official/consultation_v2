import handler from '@tanstack/react-start/server-entry'

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // Serve the Radix dApp well-known file
    if (url.pathname === '/.well-known/radix.json') {
      return Response.json({
        dApps: [
          {
            dAppDefinitionAddress: env.DAPP_DEFINITION_ADDRESS ?? '',
          },
        ],
      })
    }

    return handler.fetch(request, env, ctx)
  },
}
