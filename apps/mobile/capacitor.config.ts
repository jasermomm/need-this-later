import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.needthislater.mobile",
  appName: "I Need This Later",
  webDir: "../../dist-pages",
  backgroundColor: "#f4f3ef",
  server: { androidScheme: "https" },
  ios: { contentInset: "automatic", scheme: "NeedThisLater" },
  android: { allowMixedContent: false, backgroundColor: "#f4f3ef" },
};

export default config;
