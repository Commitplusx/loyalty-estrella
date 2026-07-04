import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";
await load({ export: true, envPath: ".env" });

const MAPS_KEY = Deno.env.get('GOOGLE_MAPS_KEY') ?? '';
if (!MAPS_KEY) {
  console.log("No MAPS_KEY");
  Deno.exit(1);
}

const queryPartes = "Avenida Adolfo Lopez Mateos 17, Belisario Dominguez, Comitán, Chiapas";

const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(queryPartes)}&key=${MAPS_KEY}`;
console.log("Fetching geo...");
const geoRes = await fetch(geoUrl);
const geoJson = await geoRes.json();
console.log("Geocoding result:", JSON.stringify(geoJson, null, 2));

const placesUrl = 'https://places.googleapis.com/v1/places:searchText';
const placesRes = await fetch(placesUrl, {
  method: 'POST',
  headers: { 'X-Goog-Api-Key': MAPS_KEY, 'X-Goog-FieldMask': 'places.displayName,places.location', 'Content-Type': 'application/json' },
  body: JSON.stringify({ textQuery: queryPartes })
});
const placesJson = await placesRes.json();
console.log("Places result:", JSON.stringify(placesJson, null, 2));
