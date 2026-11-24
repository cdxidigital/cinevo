import { useMemo } from "react";
import { useCinevo } from "./cinevo-store";
import { applySourceFilter } from "./library";
import { applyTitlePatch } from "./house-tools";
import { PREVIEW_TITLES } from "./preview-house";

export { applySourceFilter };

export function useLibrary() {
  const previewHouse = useCinevo((s) => s.previewHouse);
  const local = useCinevo((s) => s.localTitles);
  const remote = useCinevo((s) => s.remoteTitles);
  const filter = useCinevo((s) => s.sourceFilter);
  const activeSourceId = useCinevo((s) => s.activeSourceId);
  const sources = useCinevo((s) => s.sources);
  const patches = useCinevo((s) => s.patches);
  return useMemo(() => {
    if (previewHouse) return PREVIEW_TITLES;
    let pool = applySourceFilter(filter, local, remote).map((title) => applyTitlePatch(title, patches[title.id]));
    if (activeSourceId && activeSourceId !== "all") {
      const source = sources.find((item) => item.id === activeSourceId);
      if (source) {
        pool = pool.filter(
          (title) => title.sourceLabel === source.name || title.sourceLabel?.startsWith(`${source.name} ·`),
        );
      }
    }
    return pool;
  }, [previewHouse, local, remote, filter, activeSourceId, sources, patches]);
}