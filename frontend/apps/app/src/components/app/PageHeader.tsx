import * as React from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: React.ReactNode;
  action?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, action }: PageHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-8 mb-10 border-b border-hairline">
      <div>
        <p className="overline mb-2">{eyebrow}</p>
        <h1 className="font-display text-4xl">{title}</h1>
      </div>
      {action}
    </header>
  );
}
