const https = require('https');

const url = 'https://docs.google.com/spreadsheets/d/1Adqek-yq8YTSbsQ_zQTgbpT_p4R0lhskitPTcL6hX0M/export?format=csv';

console.log("Iniciando petición a:", url);

https.get(url, (res) => {
  console.log("STATUS CODE:", res.statusCode);
  console.log("HEADERS:", JSON.stringify(res.headers, null, 2));
  
  // Handle redirects (status 301, 302, 307)
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log("REDIRECCIÓN DETECTADA A:", res.headers.location);
      // We could fetch the redirect but let's see where it goes first.
  }

  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("\n--- BODY PREVIEW (first 1000 chars) ---");
    console.log(data.substring(0, 1000));
    console.log("---------------------------------------\n");
  });
}).on('error', (err) => {
  console.error("ERROR DE CONEXIÓN:", err.message);
});
