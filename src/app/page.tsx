import { redirectToSetupIfNeeded } from "@/lib/first-run";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  await redirectToSetupIfNeeded();
  return <HomeClient />;
}
