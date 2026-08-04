export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-7 sm:py-24">
      <h1 className="m-0 font-serif text-3xl font-bold text-ink-900 sm:text-4xl">{title}</h1>
      <p className="mt-4 font-sans text-base text-ink-500">Coming soon.</p>
    </div>
  );
}
