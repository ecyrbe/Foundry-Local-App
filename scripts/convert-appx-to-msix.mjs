import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const releaseDir = path.resolve('release');
const unpackedAppDir = path.join(releaseDir, 'win-unpacked');
const msixContentDir = path.join(releaseDir, 'msix-content');
const generatedAssetsDir = path.resolve('build', 'generated', 'appx');
const timestampServer = process.env.MSIX_TIMESTAMP_SERVER || 'http://timestamp.digicert.com';
const backgroundColor = process.env.MSIX_BACKGROUND_COLOR || '#111827';
const packageArchitecture = 'x64';

if (process.platform !== 'win32') {
  throw new Error('MSIX packaging is only supported on Windows runners.');
}

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false
  });

  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`${path.basename(command)} exited with code ${code ?? 'unknown'}.`));
  });
});

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const compareVersionSegments = (left, right) => {
  const leftParts = left.split('.').map((value) => Number.parseInt(value, 10) || 0);
  const rightParts = right.split('.').map((value) => Number.parseInt(value, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const difference = (rightParts[index] || 0) - (leftParts[index] || 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

const findWindowsKitTool = async (toolName) => {
  const windowsKitRoot = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  const fallbackDir = 'C:\\Program Files (x86)\\Windows Kits\\10\\App Certification Kit';
  const fallbackPath = path.join(fallbackDir, toolName);

  if (await fileExists(fallbackPath)) {
    return fallbackPath;
  }

  const entries = await readdir(windowsKitRoot, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersionSegments);

  for (const version of versions) {
    const candidatePath = path.join(windowsKitRoot, version, 'x64', toolName);

    if (await fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(`Unable to locate ${toolName} in the Windows SDK.`);
};

const normalizeVersion = (rawVersion) => {
  const numericParts = rawVersion
    .split(/[^0-9]+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((value) => Number.parseInt(value, 10) || 0);

  while (numericParts.length < 4) {
    numericParts.push(0);
  }

  return numericParts.join('.');
};

const escapeXml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const copyGeneratedAssets = async (assetsDir) => {
  const requiredAssetNames = [
    'StoreLogo.png',
    'Square44x44Logo.png',
    'Square150x150Logo.png'
  ];

  for (const assetName of requiredAssetNames) {
    const assetPath = path.join(generatedAssetsDir, assetName);

    if (!(await fileExists(assetPath))) {
      throw new Error(`Missing generated MSIX asset: ${assetPath}. Run npm run assets:icons first.`);
    }
  }

  await cp(generatedAssetsDir, assetsDir, { recursive: true });
};

const writeManifest = async ({ packageName, productName, publisherDisplayName, version, executableName, publisher }) => {
  const manifestContents = `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Identity Name="${escapeXml(packageName)}" Publisher="${escapeXml(publisher)}" Version="${escapeXml(version)}" ProcessorArchitecture="${packageArchitecture}" />
  <Properties>
    <DisplayName>${escapeXml(productName)}</DisplayName>
    <PublisherDisplayName>${escapeXml(publisherDisplayName)}</PublisherDisplayName>
    <Description>${escapeXml(productName)}</Description>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="en-US" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
  <Applications>
    <Application Id="${escapeXml(executableName)}" Executable="${escapeXml(executableName)}.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        BackgroundColor="${escapeXml(backgroundColor)}"
        DisplayName="${escapeXml(productName)}"
        Description="${escapeXml(productName)}"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png" />
    </Application>
  </Applications>
</Package>
`;

  await writeFile(path.join(msixContentDir, 'AppxManifest.xml'), manifestContents);
};

const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
const productName = process.env.MSIX_DISPLAY_NAME || packageJson.productName || 'Foundry Local App';
const publisherDisplayName = process.env.APPX_PUBLISHER_DISPLAY_NAME || productName;
const publisher = process.env.APPX_PUBLISHER || 'CN=FoundryLocalApp';
const packageName = process.env.APPX_IDENTITY_NAME || 'FoundryLocalApp';
const executableName = process.env.MSIX_EXECUTABLE_NAME || 'FoundryLocalApp';
const packageVersion = normalizeVersion(packageJson.version || '1.0.0');
const msixPath = path.join(releaseDir, `${productName}-${packageVersion}-${packageArchitecture}.msix`);

if (!(await fileExists(unpackedAppDir))) {
  throw new Error('Expected release/win-unpacked to exist. Run the unpacked Windows build first.');
}

await rm(msixContentDir, { recursive: true, force: true });
await rm(msixPath, { force: true });
await mkdir(msixContentDir, { recursive: true });

await cp(unpackedAppDir, msixContentDir, { recursive: true });

const executablePath = path.join(msixContentDir, `${executableName}.exe`);

if (!(await fileExists(executablePath))) {
  throw new Error(`Expected packaged executable at ${executablePath}.`);
}

const assetsDir = path.join(msixContentDir, 'Assets');
await mkdir(assetsDir, { recursive: true });
await copyGeneratedAssets(assetsDir);
await writeManifest({
  packageName,
  productName,
  publisherDisplayName,
  version: packageVersion,
  executableName,
  publisher
});

const makeAppxPath = await findWindowsKitTool('makeappx.exe');
await run(makeAppxPath, ['pack', '/o', '/d', msixContentDir, '/p', msixPath]);

const signMsixIfConfigured = async (msixPath) => {
  const certificateBase64 = process.env.WINDOWS_CERT_BASE64;
  const certificatePassword = process.env.WINDOWS_CERT_PASSWORD;

  if (!certificateBase64 || !certificatePassword) {
    console.warn('Skipping MSIX signing because WINDOWS_CERT_BASE64 or WINDOWS_CERT_PASSWORD is not set.');
    return;
  }

  const signtoolPath = await findWindowsKitTool('signtool.exe');
  const certificatePath = path.join(releaseDir, 'windows-signing-cert.pfx');
  await writeFile(certificatePath, Buffer.from(certificateBase64, 'base64'));

  try {
    await run(signtoolPath, [
      'sign',
      '/fd',
      'SHA256',
      '/a',
      '/f',
      certificatePath,
      '/p',
      certificatePassword,
      '/tr',
      timestampServer,
      '/td',
      'SHA256',
      msixPath
    ]);
  } finally {
    await rm(certificatePath, { force: true });
  }
};

await mkdir(releaseDir, { recursive: true });
await signMsixIfConfigured(msixPath);

const relativeMsixPath = path.relative(process.cwd(), msixPath);
console.log(`Created ${relativeMsixPath}`);

const manifestPath = path.join(releaseDir, 'latest-msix-path.txt');
await writeFile(manifestPath, `${relativeMsixPath}\n`);
