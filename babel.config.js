module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin powers react-native-reanimated (v4).
    // It MUST be listed last.
    plugins: ['react-native-worklets/plugin'],
  };
};
