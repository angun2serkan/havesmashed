import { ExpoConfig, ConfigContext } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const getAppName = () => {
  if (IS_DEV) return "HaveISmashed (Dev)";
  if (IS_PREVIEW) return "HaveISmashed (Preview)";
  return "HaveISmashed";
};

const getBundleIdentifier = () => {
  if (IS_DEV) return "com.havesmashed.mobile.dev";
  if (IS_PREVIEW) return "com.havesmashed.mobile.preview";
  return "com.havesmashed.mobile";
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: getAppName(),
  slug: "havesmashed",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  scheme: "havesmashed",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0a0a0f",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: getBundleIdentifier(),
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: getBundleIdentifier(),
    adaptiveIcon: {
      backgroundColor: "#0a0a0f",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
  },
  plugins: ["expo-secure-store"],
  extra: {
    apiUrl: process.env.API_URL ?? "http://localhost:3000",
    eas: {
      projectId: "1ffbc5d9-316d-49fd-a3eb-02900ee1c409",
    },
  },
});
