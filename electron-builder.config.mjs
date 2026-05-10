const productName = 'Foundry Local App';

export default {
  appId: 'com.foundrylocal.app',
  productName,
  asar: false,
  directories: {
    output: 'release',
    buildResources: 'build'
  },
  files: [
    'dist/**/*',
    'renderer-dist/**/*',
    'package.json'
  ],
  extraResources: [
    {
      from: 'build/generated/icon.ico',
      to: 'icon.ico'
    }
  ],
  extraMetadata: {
    main: 'dist/main.js'
  },
  win: {
    icon: 'build/generated/icon.ico',
    executableName: 'foundry-app',
    signAndEditExecutable: false,
    target: [
      {
        target: 'portable',
        arch: ['x64']
      },
      {
        target: 'nsis',
        arch: ['x64']
      }
    ]
  },
  portable: {
    artifactName: 'foundry-app.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: 'foundry-app-setup.${ext}'
  }
};
