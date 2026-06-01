const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'public', 'icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  // Generate 512x512 PNG (main icon)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, 'public', 'icon-512.png'));
  console.log('✓ icon-512.png');

  // Generate 192x192 PNG (Android/Web)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(__dirname, 'public', 'icon-192.png'));
  console.log('✓ icon-192.png');

  // Generate 180x180 PNG (Apple)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(__dirname, 'public', 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png');

  // Generate 32x32 PNG for favicon
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, 'public', 'favicon-32.png'));
  console.log('✓ favicon-32.png');

  // Generate 16x16 PNG for favicon (also used in multi-size ico)
  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.join(__dirname, 'public', 'favicon-16.png'));
  console.log('✓ favicon-16.png');

  // Generate .ico file (contains 16, 32, 48 sizes)
  // Simple ICO: use the 32x32 PNG as the main icon
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();

  // ICO header
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);   // reserved
  icoHeader.writeUInt16LE(1, 2);   // ICO type
  icoHeader.writeUInt16LE(2, 4);   // 2 images

  // Directory entries (16 bytes each)
  const entry32 = Buffer.alloc(16);
  entry32.writeUInt8(32, 0);       // width
  entry32.writeUInt8(32, 1);       // height
  entry32.writeUInt8(0, 2);        // colors
  entry32.writeUInt8(0, 3);        // reserved
  entry32.writeUInt16LE(1, 4);     // planes
  entry32.writeUInt16LE(32, 6);    // bpp
  entry32.writeUInt32LE(png32.length, 8);  // size
  entry32.writeUInt32LE(6 + 32, 12);       // offset (header + 2 entries)

  const entry16 = Buffer.alloc(16);
  entry16.writeUInt8(16, 0);
  entry16.writeUInt8(16, 1);
  entry16.writeUInt8(0, 2);
  entry16.writeUInt8(0, 3);
  entry16.writeUInt16LE(1, 4);
  entry16.writeUInt16LE(32, 6);
  entry16.writeUInt32LE(png16.length, 8);
  entry16.writeUInt32LE(6 + 32 + png32.length, 12);

  const ico = Buffer.concat([
    icoHeader,
    entry32,
    entry16,
    png32,
    png16
  ]);

  fs.writeFileSync(path.join(__dirname, 'public', 'favicon.ico'), ico);
  console.log('✓ favicon.ico (32x32 + 16x16)');

  // Generate site.webmanifest
  const manifest = {
    name: "昆虫信息数据库",
    short_name: "昆虫数据库",
    description: "天水市果树研究所昆虫标本电子档案管理系统",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0d9488",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
  fs.writeFileSync(
    path.join(__dirname, 'public', 'site.webmanifest'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('✓ site.webmanifest');

  console.log('\n🎉 All icons generated!');
}

generate().catch(console.error);
