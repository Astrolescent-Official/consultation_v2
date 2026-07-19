/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    const awsRegion = (process.env.AWS_REGION ??
      'eu-west-1') as $util.Input<aws.Region>
    const isProduction = input.stage === 'production'

    return {
      name: 'vote-collector',
      removal: isProduction ? 'retain' : 'remove',
      protect: isProduction,
      home: 'aws',
      providers: {
        aws: { region: awsRegion }
      }
    }
  },
  async run() {
    const { Config, Duration, Effect } = await import('effect')

    const {
      databaseUrl,
      environment,
      networkId,
      pollSchedule,
      pollTimeoutDuration
    } = Effect.runSync(
      Effect.gen(function* () {
        const databaseUrl = yield* Config.string('DATABASE_URL').pipe(
          Effect.orDie
        )
        const environment = yield* Config.string('ENV').pipe(
          Config.withDefault(
            $app.stage === 'production' ? 'production' : 'test'
          )
        )
        const networkId = yield* Config.string('NETWORK_ID').pipe(
          Config.withDefault($app.stage === 'production' ? 1 : 2)
        )
        const pollSchedule = yield* Config.string('POLL_SCHEDULE').pipe(
          Config.withDefault('rate(5 minutes)')
        )
        const pollTimeoutDuration = yield* Config.duration(
          'POLL_TIMEOUT_DURATION'
        ).pipe(
          Config.withDefault(Duration.seconds(120)),
          Effect.map(Duration.toSeconds),
          Effect.orDie
        )

        return {
          databaseUrl,
          environment,
          networkId,
          pollSchedule,
          pollTimeoutDuration
        }
      })
    )

    if ($app.stage === 'production' && networkId !== '1') {
      throw new Error('The production SST stage requires NETWORK_ID=1')
    }

    if ($app.stage === 'test' && networkId !== '2') {
      throw new Error('The test SST stage requires NETWORK_ID=2')
    }

    const commonFnProps = {
      runtime: 'nodejs22.x' as const,
      environment: {
        DATABASE_URL: databaseUrl,
        ENV: environment,
        NETWORK_ID: networkId.toString(),
        POLL_TIMEOUT_DURATION: `${pollTimeoutDuration} seconds`
      },
      nodejs: {
        install: ['pg']
      }
    }

    new sst.aws.Cron('Poll', {
      function: {
        handler: 'src/handlers.poll',
        timeout: `${pollTimeoutDuration} seconds`,
        ...commonFnProps
      },
      schedule: pollSchedule
    })

    const api = new sst.aws.ApiGatewayV2('Api')

    api.route('GET /vote-results', {
      handler: 'src/handlers.getVoteResults',
      timeout: '30 seconds',
      ...commonFnProps
    })

    api.route('GET /account-votes', {
      handler: 'src/handlers.getAccountVotes',
      timeout: '30 seconds',
      ...commonFnProps
    })

    return {
      api: api.url,
      networkId,
      pollSchedule,
      stage: $app.stage
    }
  }
})
