import { Header } from "./components/Header";
import { MemoBadge } from "./components/MemoBadge";
import AnonComponent from "./AnonComponent";
import { formatTitle } from "@/utils/helpers";

export default function App() {
  return (
    <div>
      <h1>{formatTitle("app")}</h1>
      <Header />
      <MemoBadge />
      <AnonComponent />
    </div>
  );
}
