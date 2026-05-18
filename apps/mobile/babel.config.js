module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 requires the worklets plugin explicitly (it was bundled in v3).
      // Must be listed LAST per the Reanimated docs.
      'react-native-worklets/plugin',
    ],
  };
};
