const birr = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

/** An ETB price, set as a figure with the currency underneath, as on a printed menu. */
export function Price({ santim }: { santim: number }) {
  return (
    <data value={santim / 100} data-testid="price" className="flex flex-col items-end leading-none">
      <span className="text-base font-semibold tabular-nums">{birr.format(santim / 100)}</span>{" "}
      <span className="mt-1 text-[0.6875rem] font-medium tracking-wide text-ink-muted">ETB</span>
    </data>
  );
}
