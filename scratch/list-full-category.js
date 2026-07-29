const https = require('https');

const url = 'https://api.mercadolibre.com/categories/MLA1744';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log("Raw Response Keys:", Object.keys(result));
      console.log("Name:", result.name);
      console.log("Total Items:", result.total_items_in_this_category);
      console.log("Children categories length:", result.children_categories ? result.children_categories.length : 0);
      console.log("Settings:", JSON.stringify(result.settings, null, 2));
    } catch (e) {
      console.error("Error al parsear:", e);
    }
  });
}).on('error', (err) => {
  console.error("Error:", err.message);
});
