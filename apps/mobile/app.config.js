// Reads app.json and adds one setting that is only needed when building on Windows.
//
// The Android native build creates very long file paths. Windows (with long paths switched on) copes only when the
// Android SDK's CMake is version 3.31.6 or newer, so on Windows we ask for it. Cloud builds (EAS) run on Linux,
// do not have that CMake version and do not need it, so they keep the default.
// See https://docs.expo.dev/troubleshooting/windows-long-paths/
const isWindows = process.platform === 'win32';

module.exports = ({ config }) => ({
  ...config,
  plugins: (config.plugins ?? []).map((p) =>
    Array.isArray(p) && p[0] === 'expo-build-properties'
      ? ['expo-build-properties', { ...p[1], android: { ...(p[1] && p[1].android), ...(isWindows ? { cmakeVersion: '3.31.6' } : {}) } }]
      : p,
  ),
});
