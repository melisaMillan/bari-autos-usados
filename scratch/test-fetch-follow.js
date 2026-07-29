const https = require('https');

function fetch(url) {
  console.log("Fetcheando:", url);
  https.get(url, (res) => {
    console.log("STATUS CODE:", res.statusCode);
    
    // Check for redirect
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log("Redirigiendo a:", res.headers.location);
        fetch(res.headers.location);
        return;
    }
    
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log("\n--- RESULT BODY PREVIEW (first 800 chars) ---");
      console.log(data.substring(0, 800));
      console.log("---------------------------------------------\n");
    });
  }).on('error', (err) => {
    console.error("ERROR:", err.message);
  });
}

fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vQNeU-0-iHoNdVLACtHnPEpWI_ImAiymdaV0BH_IU53w_7YsG51T5HiKU5t8pGpx8JiRQf3t7anzy0t/pub?output=csv');
