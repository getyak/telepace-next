/**
 * Renders one or more JSON-LD documents into a `<script type="application/ld+json">`.
 *
 * Server component — the payload is built on the server from trusted config and
 * translations, never user input. We still escape `<` to `<` so a stray
 * angle bracket in copy can't break out of the script element.
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
}) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- serialized trusted schema, `<` escaped above
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
