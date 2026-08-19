import App from "./App";
import ClassComp from "./ClassComp";

function mount() {
  return [App({}), ClassComp];
}

mount();
