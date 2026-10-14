import { serializeJsonLd, type JsonLdNode } from "@/lib/schema";

/** Renders one or more schema.org nodes as a JSON-LD script. Server component; nothing reaches the client bundle. */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
