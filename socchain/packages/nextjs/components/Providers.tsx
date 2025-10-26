"use client";

import dynamic from "next/dynamic";
import { ScaffoldEthAppWithProviders } from "./ScaffoldEthAppWithProviders";

const DynamicThemeProvider = dynamic(
  () => import("./ThemeProvider").then((mod) => ({ default: mod.ThemeProvider })),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DynamicThemeProvider enableSystem>
      <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
    </DynamicThemeProvider>
  );
}