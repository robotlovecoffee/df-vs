const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 3000;

// Set testing mode - if true, only use the first 10 images.
const testing = false;

// Serve static files from the "public" directory and parse JSON bodies.
app.use(express.static("public"));
app.use(express.json());

// Path to persistence file.
const dataFile = path.join(__dirname, "data.json");

// Load images from image.json
let images = JSON.parse(fs.readFileSync("image.json", "utf8"));

// If in testing mode, limit images to first 10.
if (testing) {
  images = images.slice(0, 10);
}

// In-memory data structures for vote data.
let ratings = {};
let matchups = {};

// Initialize Elo ratings (base rating 1500 for each image)
images.forEach((img) => {
  ratings[img.id] = 1500;
});

// Load persistent data if available.
if (fs.existsSync(dataFile)) {
  try {
    const savedData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    ratings = savedData.ratings || ratings;
    matchups = savedData.matchups || matchups;
  } catch (err) {
    console.error("Error reading data.json:", err);
  }
}

// Function to save in-memory data to file.
function saveData() {
  const data = { ratings, matchups };
  fs.writeFile(dataFile, JSON.stringify(data, null, 2), (err) => {
    if (err) console.error("Error saving data:", err);
  });
}

// Elo rating update function (still used internally).
function updateElo(winner, loser, k = 32) {
  const ratingWinner = ratings[winner];
  const ratingLoser = ratings[loser];
  const expectedWinner =
    1 / (1 + Math.pow(10, (ratingLoser - ratingWinner) / 400));
  const expectedLoser =
    1 / (1 + Math.pow(10, (ratingWinner - ratingLoser) / 400));
  ratings[winner] = ratingWinner + k * (1 - expectedWinner);
  ratings[loser] = ratingLoser + k * (0 - expectedLoser);
}

// Endpoint: GET /vote - Returns two random images for voting.
app.get("/vote", (req, res) => {
  let idx1 = Math.floor(Math.random() * images.length);
  let idx2 = Math.floor(Math.random() * images.length);
  while (idx2 === idx1) {
    idx2 = Math.floor(Math.random() * images.length);
  }
  res.json({
    image1: images[idx1],
    image2: images[idx2],
  });
});

// Endpoint: POST /vote - Records a vote, updates Elo ratings, and saves data.
app.post("/vote", (req, res) => {
  const { image1, image2, winner } = req.body;

  // Validate that the winner is one of the two images shown.
  if (![image1, image2].includes(winner)) {
    return res.status(400).json({ error: "Invalid vote" });
  }

  // Normalize the matchup key by sorting the image IDs.
  const pairKey = [image1, image2].sort().join("_");

  // Initialize the matchup record if not present.
  if (!matchups[pairKey]) {
    matchups[pairKey] = {
      [image1]: 0,
      [image2]: 0,
    };
  }

  // Record the vote by incrementing the win count for the selected image.
  matchups[pairKey][winner] += 1;

  // Update Elo ratings.
  const loser = winner === image1 ? image2 : image1;
  updateElo(winner, loser);

  // Save updated data to file.
  saveData();

  // Return the updated matchup results for this pair.
  res.json({
    message: "Vote recorded",
    matchup: matchups[pairKey],
  });
});

// Endpoint: GET /leaderboard - Returns all images with total matchups and Bayesian win rate.
// Only images that have been in at least one matchup are returned.
app.get("/leaderboard", (req, res) => {
  // Compute total wins and total matches for each image by iterating over all matchups.
  const winsByImage = {};
  const matchesByImage = {};

  // Initialize wins and matches for every image.
  images.forEach((img) => {
    winsByImage[img.id] = 0;
    matchesByImage[img.id] = 0;
  });

  // Iterate through each matchup.
  Object.values(matchups).forEach((match) => {
    // Each matchup object has keys for the image IDs and values as win counts.
    const imageIds = Object.keys(match);
    // Total votes in this matchup is the sum of wins for both images.
    const totalVotes = imageIds.reduce((sum, key) => sum + match[key], 0);
    imageIds.forEach((id) => {
      winsByImage[id] += match[id];
      matchesByImage[id] += totalVotes;
    });
  });

  // Bayesian smoothing parameters.
  const alpha = 1;
  const beta = 1;

  // Build the leaderboard data.
  // Only include images that have been in at least one matchup.
  const leaderboard = images
    .filter((img) => matchesByImage[img.id] > 0)
    .map((img) => {
      const wins = winsByImage[img.id];
      const matches = matchesByImage[img.id];
      const bayesianWinRate = ((wins + alpha) / (matches + alpha + beta)) * 100;
      return {
        id: img.id,
        link: img.link,
        totalMatchups: matches,
        bayesianWinRate: bayesianWinRate.toFixed(1),
      };
    });

  // Sort the leaderboard in descending order of Bayesian win rate.
  leaderboard.sort(
    (a, b) => Number(b.bayesianWinRate) - Number(a.bayesianWinRate)
  );
  res.json(leaderboard);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
