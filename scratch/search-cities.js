const https = require('https');

const url = 'https://api.mercadolibre.com/states/AR-B'; // Buenos Aires province

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log("PROVINCIA:", result.name);
      
      const foundCities = result.cities.filter(city => 
        city.name.toLowerCase().includes("bah") ||
        city.name.toLowerCase().includes("blan")
      );
      
      console.log("\nCIUDADES ENCONTRADAS:");
      console.log(JSON.stringify(foundCities, null, 2));
    } catch (e) {
      console.error("Error al parsear:", e);
    }
  });
}).on('error', (err) => {
  console.error("Error:", err.message);
});
