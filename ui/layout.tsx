import type { ComponentChildren } from "preact";

export interface LayoutProps {
  title: string;
  subtitle?: string;
  autoRefresh?: boolean;
  children: ComponentChildren;
}

export const Layout = (props: LayoutProps) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
        <link rel="stylesheet" href="/styles.css" />
        {props.autoRefresh ? <meta http-equiv="refresh" content="30" /> : null}
      </head>
      <body>
        <div class="wrap">
          {props.children}
        </div>
      </body>
    </html>
  );
};

export const StatusPill = ({ status }: { status: string }) => {
  return <span class={`pill st-${status}`}>{status.replaceAll("_", " ")}</span>;
};
