interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBox({ value, onChange }: SearchBoxProps) {
  return (
    <input
      type="search"
      className="search-box"
      placeholder="Search files…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
