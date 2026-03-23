export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center text-primary">
      <h1 className="text-6xl font-bold text-accent">404</h1>
      <p className="mt-4 text-muted text-lg">Page not found</p>
      <a href="/" className="mt-6 text-accent underline text-sm">
        Go Home
      </a>
    </div>
  )
}
