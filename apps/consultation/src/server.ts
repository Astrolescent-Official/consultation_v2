import handler from '@tanstack/react-start/server-entry'
import { makeAppConfigScript } from './lib/appConfig'
import { handleVotingRequest, runScheduledPoll } from './server/voting/worker'

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (
      request.method === 'GET' &&
      (url.pathname === '/vote-results' ||
        url.pathname === '/account-votes' ||
        url.pathname === '/majority-judgment-election' ||
        url.pathname === '/voting-power')
    ) {
      return handleVotingRequest(request, env)
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
    try {
      await runScheduledPoll(env, {
        cron: controller.cron,
        scheduledTime: controller.scheduledTime
      })
    } catch (error) {
      console.error('Scheduled poll invocation failed', {
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : String(error)
      })
      throw error
    }
  }
} satisfies ExportedHandler<Env>
