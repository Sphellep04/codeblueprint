import { isTitleValid } from "../utils/helpers";

export const Header = () => {
  return <div>{isTitleValid("header") ? "Header" : null}</div>;
};
