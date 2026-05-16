const fs = require('fs');
const path = require('path');

console.log('📂 Reading uszips.csv directly from your Codespaces repo...');

const csvText = fs.readFileSync('uszips.csv', 'utf-8');

const lines = csvText.trim().split('\n');
const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));

const zipCol = headers.findIndex(h => h === 'zip' || h === 'zipcode' || h === 'zcta');
const latCol = headers.findIndex(h => h === 'lat' || h === 'latitude');
const lonCol = headers.findIndex(h => h === 'lng' || h === 'lon' || h === 'long' || h === 'longitude');

console.log(`✅ Found columns → zip: ${headers[zipCol]}, lat: ${headers[latCol]}, lng: ${headers[lonCol]}`);

const lookup = {};

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const zip = cols[zipCol];
  const lat = parseFloat(cols[latCol]);
  const lon = parseFloat(cols[lonCol]);

  if (zip && !isNaN(lat) && !isNaN(lon)) {
    lookup[zip] = latLonToMaidenhead(lat, lon);
  }
}

const outputPath = path.join('public', 'zip_to_grid.json');
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(lookup), 'utf-8');

console.log(`🎉 SUCCESS! Created public/zip_to_grid.json`);
console.log(`   → ${Object.keys(lookup).length.toLocaleString()} ZIP codes processed`);
console.log(`   → File is ready for Vercel!`);

function latLonToMaidenhead(lat, lon) {
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return 'INVALID';
  lon += 180; lat += 90;
  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(lat / 10);
  const squareLon = Math.floor((lon % 20) / 2);
  const squareLat = Math.floor((lat % 10) / 1);
  const subLon = Math.floor(((lon % 2) * 12));
  const subLat = Math.floor(((lat % 1) * 24));
  return String.fromCharCode(65 + fieldLon) +
         String.fromCharCode(65 + fieldLat) +
         squareLon +
         squareLat +
         String.fromCharCode(97 + subLon) +
         String.fromCharCode(97 + subLat);
}
