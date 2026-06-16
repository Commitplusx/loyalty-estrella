const envText = new TextDecoder().decode(Deno.readFileSync('.env'));
const match = envText.match(/GOOGLE_MAPS_KEY=([^\s]+)/) || envText.match(/MAPS_KEY=([^\s]+)/);
const MAPS_KEY = match ? match[1].trim() : '';

const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=16.242138,-92.139534&key=${MAPS_KEY}`;
const res = await fetch(url);
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
