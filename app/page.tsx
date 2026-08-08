import type { Metadata } from "next";
import IneedthislaterApp from "./IneedthislaterApp";

export const metadata: Metadata = {
  title: "I Need This Later — Private capture inbox",
  description: "Capture first. Find it later. A local-first private inbox for links, notes, images, and files.",
};

export default function Home() {
  return <IneedthislaterApp />;
}
