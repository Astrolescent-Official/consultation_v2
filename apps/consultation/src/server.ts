import handler from '@tanstack/react-start/server-entry'
import {
  handleVoteCollectorRequest,
  runScheduledPoll
} from 'vote-collector/worker'
import { makeAppConfigScript } from './lib/appConfig'

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (
      request.method === 'GET' &&
      (url.pathname === '/vote-results' || url.pathname === '/account-votes')
    ) {
      return handleVoteCollectorRequest(request, env)
    }

    if (request.method === 'GET' && url.pathname === '/app-config.js') {
      return new Response(makeAppConfigScript(env), {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/javascript; charset=utf-8',
          'x-content-type-options': 'nosniff'
        }
      })
    }

    // Serve the Radix dApp well-known file
    if (url.pathname === '/.well-known/radix.json') {
      return Response.json({
        dApps: [
          {
            dAppDefinitionAddress: env.DAPP_DEFINITION_ADDRESS
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
