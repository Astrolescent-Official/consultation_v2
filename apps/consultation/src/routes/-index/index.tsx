import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { SortOrder } from '@/atom/proposalsAtom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { H1, P } from '@/components/ui/typography'
import {
  ElectionsList,
  ProposalsList,
  SortToggle,
  TemperatureChecksList
} from './components'

export const Page: React.FC = () => {
  const [activeTab, setActiveTab] = useState('proposals')
  const [proposalSort, setProposalSort] = useState<SortOrder>('desc')
  const [tcSort, setTcSort] = useState<SortOrder>('desc')
  const [electionSort, setElectionSort] = useState<SortOrder>('desc')

  const currentSort =
    activeTab === 'proposals'
      ? proposalSort
      : activeTab === 'temperature-checks'
        ? tcSort
        : electionSort
  const onSortChange =
    activeTab === 'proposals'
      ? setProposalSort
      : activeTab === 'temperature-checks'
        ? setTcSort
        : setElectionSort

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <H1>Radix Governance</H1>
        <P className="mt-2 text-neutral-500 dark:text-neutral-400">
          Participate in community governance through temperature checks and
          proposals.{' '}
          <Link
            to="/about"
            className="text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-white"
          >
            Learn how governance works
          </Link>
        </P>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="mb-1 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="proposals" className="text-xs sm:text-sm">
              Proposals
            </TabsTrigger>
            <TabsTrigger
              value="temperature-checks"
              className="text-xs sm:text-sm"
            >
              Temperature Checks
            </TabsTrigger>
            <TabsTrigger value="elections" className="text-xs sm:text-sm">
              Elections
            </TabsTrigger>
          </TabsList>

          <SortToggle
            sortOrder={currentSort}
            onSortOrderChange={onSortChange}
          />
        </div>

        <TabsContent value="proposals">
          <ProposalsList key={proposalSort} sortOrder={proposalSort} />
        </TabsContent>

        <TabsContent value="temperature-checks">
          <TemperatureChecksList key={tcSort} sortOrder={tcSort} />
        </TabsContent>

        <TabsContent value="elections">
          <ElectionsList key={electionSort} sortOrder={electionSort} />
        </TabsContent>
      </Tabs>
    </>
  )
}
