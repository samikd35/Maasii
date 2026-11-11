const birr = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

/** A price in santim as a figure in birr, such as "240" or "12.5". */
export function formatBirr(santim: number): string {
  return birr.format(santim / 100);
}

/** An ETB price, set as a figure with the currency underneath, as on a printed menu. */
export function Price({ santim }: { santim: number }) {
  return (
    <data value={santim / 100} data-testid="price" className="flex flex-col items-end leading-none">
      <span className="text-base font-semibold tabular-nums">{formatBirr(santim)}</span>{" "}
      <span className="mt-1 text-[0.6875rem] font-medium tracking-wide text-ink-muted">ETB</span>
    </data>
  );
}
