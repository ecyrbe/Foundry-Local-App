const productName = 'Foundry Local App';

export default {
  appId: 'com.foundrylocal.app',
  productName,
  asar: true,
  directories: {
    output: 'release',
    buildResources: 'build'
  },
  files: [
    'dist/**/*',
    'renderer-dist/**/*',
    'package.json'
  ],
  extraMetadata: {
    main: 'dist/main.js'
  },
  win: {
    icon: 'build/generated/icon.ico',
    executableName: 'FoundryLocalApp',
    signAndEditExecutable: false
  }
};
