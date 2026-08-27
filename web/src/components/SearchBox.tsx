import { forwardRef } from "react";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox({ value, onChange }, ref) {
  return (
    <input
      ref={ref}
      type="search"
      className="search-box"
      placeholder="Search files…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
});

export default SearchBox;
