import QuickFactCard from './QuickFactCard'

type QuickFactsRowProps = {
  facts: ReadonlyArray<string>
}

export default function QuickFactsRow({ facts }: QuickFactsRowProps) {
  const firstRowFacts = facts.slice(0, 3)
  const secondRowFacts = facts.slice(3, 5)

  return (
    <div className="mt-6">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {firstRowFacts.map((fact) => (
            <QuickFactCard key={fact} fact={fact} className="h-full min-h-[120px]" />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:justify-end">
          {secondRowFacts.map((fact) => (
            <QuickFactCard
              key={fact}
              fact={fact}
              className="h-full text-xl min-h-[120px] px-4 py-4 xl:w-[calc((100%-0.75rem)/3)] xl:max-w-[calc((100%-0.75rem)/3)]"
            />
          ))}
        </div>
      </div>
  )
}

