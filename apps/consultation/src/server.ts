import handler from '@tanstack/react-start/server-entry'

const buildTimeDappDefinitionAddress =
  import.meta.env.VITE_PUBLIC_DAPP_DEFINITION_ADDRESS ?? ''

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    // Serve the Radix dApp well-known file
    if (url.pathname === '/.well-known/radix.json') {
      return Response.json({
        dApps: [
          {
            dAppDefinitionAddress:
              env.DAPP_DEFINITION_ADDRESS || buildTimeDappDefinitionAddress
          }
        ]
      })
    }

    return handler.fetch(request)
  }
}
