import LogViewer from './LogViewer'

export default function LogsPage() {
  return (
    <main className="flex h-[calc(100dvh-var(--topbar-height))] flex-col overflow-hidden bg-app px-3 py-2 text-primary sm:px-4 lg:px-6">
      <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col gap-2 sm:gap-3">
        <LogViewer />
      </div>
    </main>
  )
}
