import handler from '@tanstack/react-start/server-entry'
import {
  handleVoteCollectorRequest,
  runScheduledPoll
} from 'vote-collector/worker'

const buildTimeDappDefinitionAddress =
  import.meta.env.VITE_PUBLIC_DAPP_DEFINITION_ADDRESS ?? ''

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (
      request.method === 'GET' &&
      (url.pathname === '/vote-results' || url.pathname === '/account-votes')
    ) {
      return handleVoteCollectorRequest(request, env)
    }

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
  },

  async scheduled(controller, env) {
    await runScheduledPoll(env, {
      cron: controller.cron,
      scheduledTime: controller.scheduledTime
    })
  }
} satisfies ExportedHandler<Env>
