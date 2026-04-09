import type { Season } from "../types";

type Props = {
  seasons: Season[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
};

export default function SeasonSelect({ seasons, value, onChange, label = "Season" }: Props) {
  return (
    <label className="season-select">
      <span className="season-select-label">{label}</span>
      <select className="season-select-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} ({s.year})
          </option>
        ))}
      </select>
    </label>
  );
}
