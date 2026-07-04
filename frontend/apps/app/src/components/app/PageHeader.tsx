/**
 * App-surface page header (distinct from the marketing PageHeader in
 * components/marketing/site-chrome.tsx): overline + display title on the
 * left, primary actions on the right, hairline base.
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="overline mb-2">{eyebrow}</p>
        <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}
