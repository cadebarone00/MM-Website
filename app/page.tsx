import MaroonLayout, { metadata } from "./the-maroon/layout";
import MaroonHome from "./the-maroon/page";

export { metadata };

export default function Home() {
  return <MaroonLayout><MaroonHome /></MaroonLayout>;
}
