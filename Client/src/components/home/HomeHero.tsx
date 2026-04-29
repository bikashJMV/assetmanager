import { Link } from 'react-router-dom'

const heroTitle = 'Meet Asset Manager'

export default function HomeHero({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-[1320px] flex-col items-center px-4 pb-8 pt-12 text-center sm:px-6 lg:px-7">
      <div className="mb-5 self-center rounded-full border border-accent-soft bg-accent-soft px-4 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
        Internal Platform
      </div>
      <div className="relative mt-6 w-full max-w-[1100px] px-2 pb-3 pt-8 sm:mt-8">
        <p
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 w-full -translate-x-1/2 text-center text-[2.8rem] font-medium leading-[0.88] tracking-[-0.06em] text-transparent opacity-90 sm:text-[3.8rem] md:text-[4.8rem] lg:text-[6rem] xl:text-[7rem]"
          style={{
            WebkitTextStroke: '1.5px var(--border)',
          }}
        >
          {heroTitle}
        </p>
        <h1 className="relative z-10 text-[3.05rem] font-medium leading-[0.9] tracking-[-0.06em] text-primary sm:text-[4.2rem] md:text-[5.2rem] lg:text-[6.4rem] xl:text-[7.4rem]">
          {heroTitle}
        </h1>
      </div>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
        Asset Manager helps teams track inventory, monitor stock health, manage employee assignments, and act early on asset risks such as warranty expiry, missing ownership, and low stock availability.
      </p>
      {isAuthenticated ? (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/assets"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover shadow-accent"
          >
            View Assets
          </Link>
          <Link
            to="/employee"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover shadow-accent"
          >
            View Employees
          </Link>
        </div>
      ) : null}
    </header>
  )
}
