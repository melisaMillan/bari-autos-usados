const https = require('https');

const url = 'https://api.mercadolibre.com/categories/MLA1744';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log("CATEGORÍA PADRE:", result.name);
      console.log("\nSUBCATEGORÍAS (Marcas):");
      
      const mercedes = result.children_categories.find(c => c.name.toLowerCase().includes("mercedes"));
      console.log("Mercedes-Benz Info:", JSON.stringify(mercedes, null, 2));
      
      console.log("\nPrimeras 15 marcas en total:");
      console.log(JSON.stringify(result.children_categories.slice(0, 15), null, 2));
    } catch (e) {
      console.error("Error al parsear:", e);
    }
  });
}).on('error', (err) => {
  console.error("Error:", err.message);
});
