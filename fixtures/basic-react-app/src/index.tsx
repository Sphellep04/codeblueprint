import App from "./App";
import ClassComp from "./ClassComp";
import { UserService, loadUser } from "./services/userService";

function mount() {
  return [App({}), ClassComp, loadUser(new UserService(), "1")];
}

mount();
