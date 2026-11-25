/**
 * The app's settings are in app.json; this only changes them for the test build (project_specs.md "Expo app Step 6").
 * APP_VARIANT=development (eas.json "development" profile): "The Maroon (Dev)" with its own app id, so it installs NEXT
 * TO the TestFlight app instead of replacing it. Every other build uses app.json as written.
 */
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== "development") return config;
  return {
    ...config,
    name: "The Maroon (Dev)",
    ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.dev` },
    android: { ...config.android, package: `${config.android.package}.dev` },
  };
};
