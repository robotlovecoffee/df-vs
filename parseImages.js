const fs = require("fs");
const path = require("path");

// Define the paths for the input and output files.
const rawFile = path.join(__dirname, "rawurls.txt");
const outputFile = path.join(__dirname, "image.json");

// Read the raw URLs from raw_urls.txt
fs.readFile(rawFile, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading raw_urls.txt:", err);
    return;
  }

  // Replace literal "\n" sequences with actual newlines.
  data = data.replace(/\\n/g, "\n");

  // Split the data into individual lines, trim whitespace, and remove empty lines.
  const lines = data
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Map each URL to an object with a unique id.
  const images = lines.map((url, index) => ({
    id: `img${index + 1}`,
    link: url,
  }));

  // Write the resulting array to image.json with pretty formatting.
  fs.writeFile(outputFile, JSON.stringify(images, null, 2), (err) => {
    if (err) {
      console.error("Error writing image.json:", err);
    } else {
      console.log(
        `Successfully parsed ${images.length} images into image.json`
      );
    }
  });
});
