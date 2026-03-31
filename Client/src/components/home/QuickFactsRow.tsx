import QuickFactCard from './QuickFactCard'

type QuickFactsRowProps = {
  facts: ReadonlyArray<string>
}

export default function QuickFactsRow({ facts }: QuickFactsRowProps) {
  return (
    <div className="mt-10">
      <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
        {facts.map((fact) => (
          <QuickFactCard key={fact} fact={fact} className="shrink-0 min-w-[255px]" />
        ))}
      </div>
    </div>
  )
}

