import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const projectRoot = process.cwd();
const svgPath = path.join(projectRoot, 'build', 'icon.svg');
const generatedDir = path.join(projectRoot, 'build', 'generated');
const icoSourceDir = path.join(generatedDir, 'ico');

const renderPng = async (svgBuffer, outputPath, width, height = width) => {
  await sharp(svgBuffer)
    .resize(width, height)
    .png()
    .toFile(outputPath);
};

await rm(generatedDir, { recursive: true, force: true });
await mkdir(icoSourceDir, { recursive: true });

const svgBuffer = await readFile(svgPath);

await renderPng(svgBuffer, path.join(generatedDir, 'icon.png'), 512);

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngPaths = [];

for (const size of icoSizes) {
  const pngPath = path.join(icoSourceDir, `icon-${size}.png`);
  await renderPng(svgBuffer, pngPath, size);
  icoPngPaths.push(pngPath);
}

const icoBuffer = await pngToIco(icoPngPaths);
await writeFile(path.join(generatedDir, 'icon.ico'), icoBuffer);
