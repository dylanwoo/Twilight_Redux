import type { Metadata } from "next";
import { TwilightStudio } from "./TwilightStudio";

export const metadata: Metadata = {
  title: "Twilight — SGI Wallpaper Generator",
  description:
    "Create and download a faithful browser-rendered version of the classic SGI IRIX Twilight wallpaper.",
};

export default function Home() {
  return <TwilightStudio />;
}
