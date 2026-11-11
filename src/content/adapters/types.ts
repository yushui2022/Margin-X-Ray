import type { PageContext, Platform } from "../../shared/types";

export interface PageAdapter {
  id: Platform;
  label: string;
  matches(url: URL): boolean;
  detect(doc: Document, url: URL): "video" | "product" | "unknown";
  extract(doc: Document, url: URL): PageContext;
}
