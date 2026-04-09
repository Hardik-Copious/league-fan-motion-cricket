import { useSearchParams } from "react-router-dom";

export const DEFAULT_SEASON = "2026";

export function useSeasonQuery() {
  const [params, setParams] = useSearchParams();
  const season = params.get("season") ?? DEFAULT_SEASON;
  const setSeason = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("season", id);
    setParams(next, { replace: true });
  };
  return { season, setSeason };
}
