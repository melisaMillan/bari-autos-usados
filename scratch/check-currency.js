const https = require('https');

const url = 'https://api.mercadolibre.com/categories/MLA37935';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Raw Response:", data);
    try {
      const result = JSON.parse(data);
      console.log("CATEGORÍA:", result.name);
      console.log("SETTINGS:", JSON.stringify(result.settings, null, 2));
    } catch (e) {
      console.error("Error al parsear:", e);
    }
  });
}).on('error', (err) => {
  console.error("Error:", err.message);
});
